import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export type CalendarEventInput = {
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  attendeeEmail?: string;
};

export type CalendarEventResult = {
  icsPath: string;
  icsContent: string;
  googleEventId?: string;
  googleHtmlLink?: string;
  provider: 'ics' | 'google+ics';
};

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly storageRoot = join(process.cwd(), 'storage', 'calendar');

  constructor(private readonly config: ConfigService) {}

  isGoogleConfigured(): boolean {
    return Boolean(
      this.config.get<string>('GOOGLE_CLIENT_EMAIL')?.trim() &&
      this.config.get<string>('GOOGLE_PRIVATE_KEY')?.trim() &&
      this.config.get<string>('GOOGLE_CALENDAR_ID')?.trim(),
    );
  }

  status() {
    return {
      ics: true,
      googleCalendar: this.isGoogleConfigured(),
      calendarId: this.config.get<string>('GOOGLE_CALENDAR_ID') ?? null,
      serviceAccount: this.config.get<string>('GOOGLE_CLIENT_EMAIL') ?? null,
    };
  }

  async createEvent(
    userId: string,
    input: CalendarEventInput,
  ): Promise<CalendarEventResult> {
    const start = input.start;
    const end = input.end ?? new Date(start.getTime() + 60 * 60 * 1000);

    const icsContent = this.buildIcs({
      ...input,
      start,
      end,
    });

    await mkdir(join(this.storageRoot, userId), { recursive: true });
    const icsPath = join(
      this.storageRoot,
      userId,
      `${Date.now()}-${randomUUID().slice(0, 8)}.ics`,
    );
    await writeFile(icsPath, icsContent, 'utf8');

    if (!this.isGoogleConfigured()) {
      return {
        icsPath,
        icsContent,
        provider: 'ics',
      };
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: this.config.get<string>('GOOGLE_CLIENT_EMAIL'),
          private_key: this.config
            .get<string>('GOOGLE_PRIVATE_KEY')
            ?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });

      const calendar = google.calendar({ version: 'v3', auth });
      const calendarId =
        this.config.get<string>('GOOGLE_CALENDAR_ID')?.trim() || 'primary';

      const event = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: input.title,
          description: input.description,
          location: input.location,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees: input.attendeeEmail
            ? [{ email: input.attendeeEmail }]
            : undefined,
        },
      });

      this.logger.log(`Created Google Calendar event ${event.data.id}`);
      return {
        icsPath,
        icsContent,
        googleEventId: event.data.id ?? undefined,
        googleHtmlLink: event.data.htmlLink ?? undefined,
        provider: 'google+ics',
      };
    } catch (err: unknown) {
      this.logger.warn(
        `Google Calendar create failed, returning ICS only: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        icsPath,
        icsContent,
        provider: 'ics',
      };
    }
  }

  private buildIcs(input: {
    title: string;
    description?: string;
    location?: string;
    start: Date;
    end: Date;
  }): string {
    const uid = `${randomUUID()}@thomos.ai`;
    const dtStamp = this.formatIcsDate(new Date());
    const dtStart = this.formatIcsDate(input.start);
    const dtEnd = this.formatIcsDate(input.end);
    const escape = (value: string) =>
      value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//thomOS//Job Agent//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escape(input.title)}`,
      input.description ? `DESCRIPTION:${escape(input.description)}` : null,
      input.location ? `LOCATION:${escape(input.location)}` : null,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]
      .filter((line) => line !== null)
      .join('\r\n');
  }

  private formatIcsDate(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  }
}
