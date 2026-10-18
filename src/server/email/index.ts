import "server-only";
import { Resend } from "resend";
import { env } from "@/config/env";

export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Dev default: prints the email (including any links) to the server log. */
export class ConsoleEmailSender implements EmailSender {
  async send({ to, subject, text }: EmailMessage): Promise<void> {
    console.info(`\n[email] to=${to}\n[email] subject=${subject}\n${text}\n`);
  }
}

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({ from: this.from, to, subject, text });
    if (error) throw new Error(`Resend failed: ${error.message}`);
  }
}

let sender: EmailSender | undefined;

export function emailSender(): EmailSender {
  if (!sender) {
    const { RESEND_API_KEY, EMAIL_FROM } = env();
    sender = RESEND_API_KEY
      ? new ResendEmailSender(RESEND_API_KEY, EMAIL_FROM)
      : new ConsoleEmailSender();
  }
  return sender;
}

export function passwordResetEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: "Reset your password",
    text: [
      "Someone asked to reset the password for your Race Training account.",
      "",
      `Reset it here (the link expires in 1 hour): ${url}`,
      "",
      "If this wasn't you, you can ignore this email.",
    ].join("\n"),
  };
}
