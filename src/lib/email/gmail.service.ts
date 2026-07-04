import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type OutboundAttachment = {
  filename: string;
  path: string;
};

export type InboundMail = {
  fromAddress?: string;
  subject?: string;
  body: string;
  uid: string;
};

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.getUser() && this.getPassword());
  }

  getUser(): string | undefined {
    return (
      this.config.get<string>('GMAIL_USER')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim()
    );
  }

  private getPassword(): string | undefined {
    return (
      this.config.get<string>('GMAIL_APP_PASSWORD')?.trim() ||
      this.config.get<string>('SMTP_PASS')?.trim()
    );
  }

  private createTransport() {
    const user = this.getUser();
    const pass = this.getPassword();
    if (!user || !pass) {
      throw new ServiceUnavailableException(
        'Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env',
      );
    }

    const host =
      this.config.get<string>('SMTP_HOST')?.trim() || 'smtp.gmail.com';
    const port = Number(this.config.get<string>('SMTP_PORT') || 465);
    const secure =
      this.config.get<string>('SMTP_SECURE') !== 'false' && port === 465;

    const options: SMTPTransport.Options = {
      host,
      port,
      secure,
      auth: { user, pass },
    };
    return nodemailer.createTransport(options);
  }

  async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    attachments?: OutboundAttachment[];
    replyTo?: string;
  }): Promise<{ messageId: string }> {
    const transport = this.createTransport();
    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.getUser() ||
      'no-reply@thomos.ai';

    const info = await transport.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      replyTo: options.replyTo || this.getUser(),
      attachments: (options.attachments ?? []).map((a) => ({
        filename: a.filename,
        path: a.path,
      })),
    });

    this.logger.log(`Sent mail ${info.messageId} → ${options.to}`);
    return { messageId: String(info.messageId || '') };
  }

  async fetchRecentInbox(limit = 10): Promise<InboundMail[]> {
    const user = this.getUser();
    const pass = this.getPassword();
    if (!user || !pass) {
      throw new ServiceUnavailableException(
        'Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env',
      );
    }

    const client = new ImapFlow({
      host: this.config.get<string>('IMAP_HOST')?.trim() || 'imap.gmail.com',
      port: Number(this.config.get<string>('IMAP_PORT') || 993),
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    const messages: InboundMail[] = [];
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const status = await client.status('INBOX', { messages: true });
        const total = status.messages ?? 0;
        if (!total) return [];

        const start = Math.max(1, total - limit + 1);
        for await (const msg of client.fetch(`${start}:${total}`, {
          envelope: true,
          source: true,
          uid: true,
        })) {
          const source = msg.source?.toString('utf8') ?? '';
          const body = this.extractTextBody(source);
          const from =
            msg.envelope?.from?.[0]?.address ||
            msg.envelope?.from?.[0]?.name ||
            undefined;
          messages.push({
            uid: String(msg.uid),
            fromAddress: from,
            subject: msg.envelope?.subject || undefined,
            body: body || source.slice(0, 8000),
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }

    return messages.reverse();
  }

  private extractTextBody(raw: string): string {
    // Prefer text/plain parts; fall back to stripped html/raw
    const textPart = raw.match(
      /Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\nContent-Type:|$)/i,
    );
    if (textPart?.[1]) {
      return this.decodeQuotedPrintable(textPart[1]).trim();
    }
    const htmlPart = raw.match(
      /Content-Type:\s*text\/html[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--|\r?\nContent-Type:|$)/i,
    );
    if (htmlPart?.[1]) {
      return this.decodeQuotedPrintable(htmlPart[1])
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    const bodyStart = raw.indexOf('\r\n\r\n');
    if (bodyStart >= 0) {
      return raw
        .slice(bodyStart + 4)
        .replace(/<[^>]+>/g, ' ')
        .trim()
        .slice(0, 8000);
    }
    return raw.slice(0, 8000);
  }

  private decodeQuotedPrintable(input: string): string {
    return input
      .replace(/=\r?\n/g, '')
      .replace(/=([A-Fa-f0-9]{2})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }
}
