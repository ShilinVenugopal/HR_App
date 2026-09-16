import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { EmailProvider, ProviderSendResult, SendEmailInput } from './types';
import { BrevoEmailProvider } from './brevoEmail.provider';

export type { EmailProvider, SendEmailInput };

/// Plain SMTP over nodemailer — works with any mailbox (Gmail app
/// password, Office365, or an SMTP relay in front of SendGrid/SES/
/// Postmark). Deliberately provider-agnostic per the "keep the provider
/// configurable" requirement: swapping this file for a different
/// EmailProvider implementation (a specific vendor's HTTP API, say)
/// requires no changes anywhere else — every call site only knows about
/// the EmailProvider interface.
///
/// Trade-off: plain SMTP has no native delivery/bounce webhooks (only
/// whether the relay accepted the message). Delivered/Bounced status on a
/// message log will only ever be populated by a provider that supports
/// webhooks; "Opened" is tracked independently via a tracking pixel
/// (see communication.service.ts) which works with any provider.
///
/// Most cloud VPS hosts block outbound SMTP ports by default, which makes
/// this provider unusable in production on those hosts — see
/// BrevoEmailProvider (brevoEmail.provider.ts) for the HTTPS-based
/// alternative that's picked automatically below when BREVO_API_KEY is set.
class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter | null {
    if (!env.smtp.host || !env.smtp.user || !env.smtp.password) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: { user: env.smtp.user, pass: env.smtp.password },
      });
    }
    return this.transporter;
  }

  async send(input: SendEmailInput): Promise<ProviderSendResult> {
    const transporter = this.getTransporter();
    if (!transporter) {
      return {
        success: false,
        errorReason: 'Email provider is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD to enable sending.',
      };
    }

    try {
      const info = await transporter.sendMail({
        from: `"${env.smtp.fromName}" <${env.smtp.fromAddress}>`,
        to: input.to,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments?.map((a) => ({ filename: a.filename, path: a.url })),
      });
      return { success: true, providerMessageId: info.messageId };
    } catch (err) {
      return { success: false, errorReason: err instanceof Error ? err.message : 'Unknown SMTP error' };
    }
  }
}

export const emailProvider: EmailProvider = env.brevo.apiKey ? new BrevoEmailProvider() : new SmtpEmailProvider();
