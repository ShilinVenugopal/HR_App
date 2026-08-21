export interface ProviderAttachment {
  filename: string;
  /// Absolute URL (e.g. this server's own /uploads/<file>) or local path.
  url: string;
}

export interface ProviderSendResult {
  success: boolean;
  /// External id from the provider — stored so inbound delivery webhooks
  /// can be correlated back to the originating CommunicationMessageLog row.
  providerMessageId?: string;
  errorReason?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: ProviderAttachment[];
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<ProviderSendResult>;
}
