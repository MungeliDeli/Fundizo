/** The only way the app sends SMS (CLAUDE.md: external systems sit behind adapters). */
export interface SmsMessage {
  /** E.164, e.g. "+260961234567". */
  to: string;
  /** Keep under 160 plain characters: longer texts are billed as several SMS. */
  text: string;
  /** Short label for the dev outbox and provider analytics, e.g. "verify-phone". */
  tag: string;
}

export interface Messaging {
  send(message: SmsMessage): Promise<void>;
}

export const MESSAGING = Symbol('MESSAGING');
