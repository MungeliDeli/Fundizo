/** The only way the app sends email. Domain code never imports a provider directly (CLAUDE.md). */
export interface MailMessage {
  to: { email: string; name?: string };
  subject: string;
  text: string;
  html: string;
  /** Short label for analytics and the dev outbox, e.g. "verify-email". */
  tag: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');
