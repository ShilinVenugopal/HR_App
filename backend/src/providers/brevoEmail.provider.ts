import fs from 'fs';
import { env } from '../config/env';
import { EmailProvider, ProviderSendResult, SendEmailInput } from './types';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/// Sends over HTTPS (port 443) via Brevo's transactional email API, instead
/// of raw SMTP. Most cloud VPS hosts (DigitalOcean, AWS, Azure, ...) block
/// outbound SMTP ports by default as an anti-spam measure, which makes
/// plain SMTP unusable in production on those hosts — the HTTPS API path
/// travels over the same port as the website itself and isn't affected.
/// See env.ts for the provider-selection rule against SmtpEmailProvider.
export class BrevoEmailProvider implements EmailProvider {
  async send(input: SendEmailInput): Promise<ProviderSendResult> {
    if (!env.brevo.apiKey || !env.brevo.fromAddress) {
      return {
        success: false,
        errorReason: 'Brevo email provider is not configured. Set BREVO_API_KEY and BREVO_FROM_ADDRESS to enable sending.',
      };
    }

    const attachment = input.attachments?.length
      ? input.attachments.map((a) => ({ name: a.filename, content: fs.readFileSync(a.url).toString('base64') }))
      : undefined;

    try {
      const res = await fetch(BREVO_SEND_URL, {
        method: 'POST',
        headers: {
          'api-key': env.brevo.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: env.brevo.fromName, email: env.brevo.fromAddress },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html,
          attachment,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string };
      if (!res.ok) {
        return { success: false, errorReason: data.message ?? `Brevo API error (HTTP ${res.status})` };
      }
      return { success: true, providerMessageId: data.messageId };
    } catch (err) {
      return { success: false, errorReason: err instanceof Error ? err.message : 'Unknown Brevo API error' };
    }
  }
}
