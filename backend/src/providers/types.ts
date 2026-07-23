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
