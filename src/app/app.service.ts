import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CalendarService } from '../lib/calendar/calendar.service';
import { GmailService } from '../lib/email/gmail.service';
import { AgentSchedulerService } from '../modules/scheduler/agent-scheduler.service';

function isSameOrSubdomain(requestHost: string, platformUrl: string): boolean {
  try {
    const platformHost = new URL(
      platformUrl.includes('://') ? platformUrl : `https://${platformUrl}`,
    ).hostname.toLowerCase();
    const host = requestHost.split(':')[0].trim().toLowerCase();
    return host === platformHost || host.endsWith('.' + platformHost);
  } catch {
    return false;
  }
}

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly gmail: GmailService,
    private readonly calendar: CalendarService,
    private readonly scheduler: AgentSchedulerService,
  ) {}

  getHello(): string {
    return 'thomOS API';
  }

  async getHealth() {
    let database: 'up' | 'down' = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    const jwtSecret = this.configService.get<string>('JWT_SECRET') ?? '';
    const weakJwt =
      !jwtSecret ||
      jwtSecret === 'dev-only-change-me' ||
      jwtSecret === 'thomos-dev-jwt-secret-change-in-production';

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'thomOS',
      timestamp: new Date().toISOString(),
      checks: {
        database,
        claude: this.configService.get<string>('ANTHROPIC_API_KEY')
          ? 'configured'
          : 'missing',
        gmail: this.gmail.isConfigured() ? 'configured' : 'missing',
        calendar: this.calendar.isGoogleConfigured()
          ? 'configured'
          : 'ics-only',
        jwt: weakJwt ? 'weak-secret' : 'ok',
        scheduler: this.scheduler.isEnabled() ? 'enabled' : 'disabled',
      },
      scheduler: this.scheduler.status(),
    };
  }

  getBranding(requestHost?: string): {
    authorName: string | null;
    authorUrl: string | null;
  } {
    const authorName = this.configService.get<string>('AUTHOR_NAME') ?? null;
    const authorUrl = this.configService.get<string>('AUTHOR_URL') ?? null;
    const platformUrl = this.configService.get<string>('PLATFORM_URL');

    if (!authorName) {
      return { authorName: null, authorUrl: null };
    }
    if (!requestHost) {
      return { authorName, authorUrl };
    }
    const host = requestHost.split(':')[0].trim().toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') {
      return { authorName, authorUrl };
    }
    if (!platformUrl) {
      return { authorName, authorUrl };
    }
    if (!isSameOrSubdomain(requestHost, platformUrl)) {
      return { authorName: null, authorUrl: null };
    }
    return { authorName, authorUrl };
  }
}
