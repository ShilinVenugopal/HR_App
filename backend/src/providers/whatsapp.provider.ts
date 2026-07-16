import { env } from '../config/env';
import { ProviderAttachment, ProviderSendResult } from './types';

export interface SendWhatsappInput {
  to: string;
  body: string;
  attachments?: ProviderAttachment[];
}

export interface WhatsappProvider {
  send(input: SendWhatsappInput): Promise<ProviderSendResult>;
}

/// Meta WhatsApp Cloud API. Same "configurable provider" contract as
/// email.provider.ts — every call site depends only on the WhatsappProvider
/// interface, so swapping to a BSP (Twilio, Gupshup, etc.) later touches
/// only this file.
///
/// Requires a Meta Business + WhatsApp Business Account (WABA) with a
/// permanent access token and phone number id, supplied via
/// WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID. Without them, every
/// send fails with a clear "not configured" reason rather than pretending
/// to succeed.
///
/// Note: outside a 24-hour customer-service window, WhatsApp Business
/// requires using a pre-approved Message Template (configured in Meta
/// Business Manager) rather than free-form text — this provider sends
/// free-form text, which Meta will reject for first-contact/cold outreach
/// until you've registered and referenced an approved template name. That
/// template-approval step happens on Meta's side, not in this codebase.
class MetaWhatsappProvider implements WhatsappProvider {
  private isConfigured(): boolean {
    return Boolean(env.whatsapp.phoneNumberId && env.whatsapp.accessToken);
  }

  private get baseUrl(): string {
    return `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`;
  }

  private async callGraphApi(payload: Record<string, unknown>): Promise<ProviderSendResult> {
    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      });

      const json = (await res.json()) as any;
      if (!res.ok) {
        return { success: false, errorReason: json?.error?.message ?? `WhatsApp API error (HTTP ${res.status})` };
      }
      return { success: true, providerMessageId: json?.messages?.[0]?.id };
    } catch (err) {
      return { success: false, errorReason: err instanceof Error ? err.message : 'Unknown WhatsApp API error' };
    }
  }

  async send(input: SendWhatsappInput): Promise<ProviderSendResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        errorReason:
          'WhatsApp provider is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to enable sending.',
      };
    }

    const textResult = await this.callGraphApi({
      to: input.to,
      type: 'text',
      text: { body: input.body, preview_url: true },
    });
    if (!textResult.success || !input.attachments?.length) return textResult;

    // WhatsApp media messages carry one attachment each — send the first
    // as a follow-up document message. (Multiple attachments would need
    // multiple messages; kept to one here to match the single "Preview"/
    // "Attachments" field the compose UI exposes.)
    const [attachment] = input.attachments;
    return this.callGraphApi({
      to: input.to,
      type: 'document',
      document: { link: attachment.url, filename: attachment.filename },
    });
  }
}

export const whatsappProvider: WhatsappProvider = new MetaWhatsappProvider();
