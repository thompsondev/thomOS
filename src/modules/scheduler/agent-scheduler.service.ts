import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../../lib/database/entities';
import { GmailService } from '../../lib/email/gmail.service';
import { OrchestratorService } from '../agents/orchestrator/orchestrator.service';
import { EmailsService } from '../emails/emails.service';

@Injectable()
export class AgentSchedulerService {
  private readonly logger = new Logger(AgentSchedulerService.name);
  private discoveryRunning = false;
  private inboxRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly orchestrator: OrchestratorService,
    private readonly emails: EmailsService,
    private readonly gmail: GmailService,
    @InjectRepository(Profile)
    private readonly profiles: Repository<Profile>,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('SCHEDULER_ENABLED') !== 'false';
  }

  status() {
    return {
      enabled: this.isEnabled(),
      discoveryCron: this.config.get<string>('DISCOVERY_CRON') || '0 */6 * * *',
      inboxCron: this.config.get<string>('INBOX_CRON') || '15 */2 * * *',
      discoveryRunning: this.discoveryRunning,
      inboxRunning: this.inboxRunning,
      gmailConfigured: this.gmail.isConfigured(),
    };
  }

  /** Every 6 hours by default — discover + match jobs for all profiles */
  @Cron('0 */6 * * *')
  async runScheduledDiscovery() {
    if (!this.isEnabled()) return;
    if (this.discoveryRunning) {
      this.logger.warn('Discovery already running — skipping tick');
      return;
    }

    this.discoveryRunning = true;
    const started = Date.now();
    try {
      const profiles = await this.profiles.find({ select: { userId: true } });
      this.logger.log(
        `Scheduled discovery starting for ${profiles.length} profile(s)`,
      );

      let savedTotal = 0;
      for (const profile of profiles) {
        try {
          const result = await this.orchestrator.runDiscoveryPipeline(
            profile.userId,
            {
              limit: Number(this.config.get<string>('DISCOVERY_LIMIT') || 5),
            },
          );
          const disc = result.steps.find((s) => s.agentId === 'discovery');
          const saved =
            (disc?.data as { jobIds?: string[] } | undefined)?.jobIds?.length ??
            0;
          savedTotal += saved;
          this.logger.log(
            `Discovery for ${profile.userId}: ${disc?.summary ?? 'done'} (${saved} new)`,
          );
        } catch (err: unknown) {
          this.logger.error(
            `Discovery failed for ${profile.userId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      this.logger.log(
        `Scheduled discovery finished in ${Date.now() - started}ms — ${savedTotal} job(s) saved`,
      );
    } finally {
      this.discoveryRunning = false;
    }
  }

  /** Every 2 hours at :15 — sync Gmail inbox for the configured mailbox user */
  @Cron('15 */2 * * *')
  async runScheduledInboxSync() {
    if (!this.isEnabled()) return;
    if (!this.gmail.isConfigured()) return;
    if (this.inboxRunning) {
      this.logger.warn('Inbox sync already running — skipping tick');
      return;
    }

    const userId = (
      this.config.get<string>('EMAIL_INBOX_USER_ID') ||
      this.gmail.getUser() ||
      ''
    )
      .trim()
      .toLowerCase();
    if (!userId) return;

    this.inboxRunning = true;
    try {
      const result = await this.emails.syncInbox(
        userId,
        Number(this.config.get<string>('INBOX_SYNC_LIMIT') || 10),
      );
      this.logger.log(
        `Scheduled inbox sync for ${userId}: fetched ${result.fetched}, ingested ${result.ingested}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Inbox sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.inboxRunning = false;
    }
  }

  /** Manual trigger (used by API / dashboard) */
  async runDiscoveryNow() {
    await this.runScheduledDiscovery();
    return this.status();
  }

  async runInboxSyncNow() {
    await this.runScheduledInboxSync();
    return this.status();
  }
}
