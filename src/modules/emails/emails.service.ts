import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { access } from 'fs/promises';
import { basename } from 'path';
import { Repository } from 'typeorm';
import {
  AgentId,
  Application,
  ApplicationStatus,
  Document,
  DocumentType,
  EmailCategory,
  EmailMessage,
  Job,
  Profile,
} from '../../lib/database/entities';
import { AiService } from '../../lib/ai/ai.service';
import { GmailService } from '../../lib/email/gmail.service';
import { OrchestratorService } from '../agents/orchestrator/orchestrator.service';

export type IngestEmailDto = {
  userId: string;
  fromAddress?: string;
  subject?: string;
  body: string;
  applicationId?: string;
  jobId?: string;
  source?: string;
};

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    @InjectRepository(EmailMessage)
    private readonly emails: Repository<EmailMessage>,
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
    @InjectRepository(Profile)
    private readonly profiles: Repository<Profile>,
    private readonly orchestrator: OrchestratorService,
    private readonly gmail: GmailService,
    private readonly ai: AiService,
  ) {}

  status() {
    return {
      configured: this.gmail.isConfigured(),
      user: this.gmail.getUser() ?? null,
      capabilities: {
        sendApplication: true,
        syncInbox: true,
        ingestPaste: true,
        webhook: true,
      },
    };
  }

  list(userId: string, limit = 30): Promise<EmailMessage[]> {
    return this.emails.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async get(userId: string, id: string): Promise<EmailMessage> {
    const email = await this.emails.findOne({ where: { id, userId } });
    if (!email) throw new NotFoundException('Email not found');
    return email;
  }

  async ingest(dto: IngestEmailDto): Promise<EmailMessage> {
    const body = dto.body?.trim();
    if (!body) {
      throw new BadRequestException('Email body is required');
    }

    const jobs = await this.jobs.find({ where: { userId: dto.userId } });
    const apps = await this.applications.find({
      where: { userId: dto.userId },
    });

    let jobId = dto.jobId ?? null;
    let applicationId = dto.applicationId ?? null;

    if (!jobId || !applicationId) {
      const matched = this.matchApplication(
        `${dto.subject ?? ''}\n${body}`,
        jobs,
        apps,
      );
      jobId = jobId ?? matched.jobId;
      applicationId = applicationId ?? matched.applicationId;
    }

    const emailText = [
      dto.fromAddress ? `From: ${dto.fromAddress}` : null,
      dto.subject ? `Subject: ${dto.subject}` : null,
      '',
      body,
    ]
      .filter((line) => line !== null)
      .join('\n');

    const result = await this.orchestrator.runAgent(AgentId.EMAIL, dto.userId, {
      jobId: jobId ?? undefined,
      applicationId: applicationId ?? undefined,
      input: {
        emailText,
        fromAddress: dto.fromAddress,
        subject: dto.subject,
      },
    });

    const data = (result.data ?? {}) as {
      category?: EmailCategory;
      applicationStatus?: ApplicationStatus | null;
      interviewAt?: string | null;
      summary?: string;
      calendarSuggestion?: string | null;
      requiresApproval?: boolean;
    };

    let interviewAt: Date | null = null;
    if (data.interviewAt) {
      const parsed = new Date(data.interviewAt);
      if (!Number.isNaN(parsed.getTime())) interviewAt = parsed;
    }

    const record = await this.emails.save(
      this.emails.create({
        userId: dto.userId,
        fromAddress: dto.fromAddress ?? null,
        subject: dto.subject ?? null,
        body,
        category: result.success ? (data.category ?? 'other') : null,
        summary: result.success
          ? (data.summary ?? result.summary)
          : (result.error ?? result.summary),
        interviewAt,
        calendarSuggestion: data.calendarSuggestion ?? null,
        requiresApproval: data.requiresApproval !== false,
        applicationId,
        jobId,
        applicationStatus: data.applicationStatus ?? null,
        metadata: {
          source: dto.source ?? 'manual',
          direction: 'inbound',
          agentSuccess: result.success,
          agentSummary: result.summary,
        },
      }),
    );

    this.logger.log(
      `Ingested email ${record.id} for ${dto.userId} → ${record.category}`,
    );
    return record;
  }

  /**
   * Send CV + cover letter to a hiring email address via Gmail.
   */
  async sendApplication(
    userId: string,
    options: {
      jobId: string;
      to: string;
      applicationId?: string;
      customMessage?: string;
    },
  ) {
    if (!this.gmail.isConfigured()) {
      throw new BadRequestException(
        'Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD (Google App Password) in .env',
      );
    }

    const to = options.to?.trim();
    if (!to || !to.includes('@')) {
      throw new BadRequestException('A valid recipient email (to) is required');
    }

    const job = await this.jobs.findOne({
      where: { id: options.jobId, userId },
    });
    if (!job) throw new NotFoundException('Job not found');

    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile?.masterResume) {
      throw new BadRequestException(
        'Master profile/resume is required before emailing an application',
      );
    }

    let application =
      (options.applicationId
        ? await this.applications.findOne({
            where: { id: options.applicationId, userId },
          })
        : await this.applications.findOne({
            where: { jobId: job.id, userId },
          })) ?? null;

    if (!application) {
      const match = await this.orchestrator.runAgent(AgentId.MATCHING, userId, {
        jobId: job.id,
      });
      const applicationId = (
        match.data as { applicationId?: string } | undefined
      )?.applicationId;
      if (applicationId) {
        application = await this.applications.findOne({
          where: { id: applicationId, userId },
        });
      }
    }

    const docs = await this.ensureApplicationDocuments(
      userId,
      job.id,
      application?.id,
    );

    const draft = await this.draftApplicationEmail({
      profile,
      job,
      customMessage: options.customMessage,
      to,
    });

    const attachments = [
      {
        filename: this.pdfFilename(docs.resume, 'CV'),
        path: docs.resumePath,
      },
      {
        filename: this.pdfFilename(docs.coverLetter, 'Cover_Letter'),
        path: docs.coverPath,
      },
    ];

    const sent = await this.gmail.sendMail({
      to,
      subject: draft.subject,
      text: draft.body,
      attachments,
    });

    if (application) {
      application.status = ApplicationStatus.APPLIED;
      application.submittedAt = application.submittedAt ?? new Date();
      application.metadata = {
        ...application.metadata,
        emailedTo: to,
        emailedAt: new Date().toISOString(),
        emailMessageId: sent.messageId,
      };
      await this.applications.save(application);
    }

    const record = await this.emails.save(
      this.emails.create({
        userId,
        fromAddress: this.gmail.getUser() ?? null,
        subject: draft.subject,
        body: draft.body,
        category: 'other',
        summary: `Application emailed to ${to} for ${job.title} @ ${job.company}`,
        interviewAt: null,
        calendarSuggestion: null,
        requiresApproval: false,
        applicationId: application?.id ?? null,
        jobId: job.id,
        applicationStatus: ApplicationStatus.APPLIED,
        metadata: {
          direction: 'outbound',
          source: 'gmail_send',
          to,
          messageId: sent.messageId,
          attachments: attachments.map((a) => a.filename),
          resumeDocumentId: docs.resume.id,
          coverLetterDocumentId: docs.coverLetter.id,
        },
      }),
    );

    return {
      email: record,
      messageId: sent.messageId,
      to,
      subject: draft.subject,
      applicationId: application?.id ?? null,
      attachments: attachments.map((a) => a.filename),
    };
  }

  async syncInbox(userId: string, limit = 10) {
    if (!this.gmail.isConfigured()) {
      throw new BadRequestException(
        'Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env',
      );
    }

    const messages = await this.gmail.fetchRecentInbox(limit);
    const ingested: EmailMessage[] = [];

    for (const msg of messages) {
      if (!msg.body?.trim()) continue;

      // Skip messages we already stored (same subject+from recently)
      const recent = await this.emails.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 40,
      });
      const existing = recent.find(
        (row) =>
          row.subject === (msg.subject ?? null) &&
          row.fromAddress === (msg.fromAddress ?? null) &&
          row.body.slice(0, 200) === msg.body.slice(0, 200) &&
          Date.now() - row.createdAt.getTime() < 1000 * 60 * 60 * 24 * 7,
      );
      if (existing) continue;

      const record = await this.ingest({
        userId,
        fromAddress: msg.fromAddress,
        subject: msg.subject,
        body: msg.body,
        source: `gmail_imap:${msg.uid}`,
      });
      ingested.push(record);
    }

    return {
      fetched: messages.length,
      ingested: ingested.length,
      emails: ingested,
    };
  }

  private async ensureApplicationDocuments(
    userId: string,
    jobId: string,
    applicationId?: string | null,
  ) {
    const findDoc = async (type: DocumentType) => {
      const rows = await this.documents.find({
        where: { userId, jobId, type },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      return rows[0];
    };

    let resume = await findDoc(DocumentType.RESUME);
    let coverLetter = await findDoc(DocumentType.COVER_LETTER);

    const resumePath =
      typeof resume?.metadata?.filePath === 'string'
        ? resume.metadata.filePath
        : null;
    const coverPath =
      typeof coverLetter?.metadata?.filePath === 'string'
        ? coverLetter.metadata.filePath
        : null;

    const resumeOk = resumePath && (await this.fileExists(resumePath));
    const coverOk = coverPath && (await this.fileExists(coverPath));

    if (!resumeOk || !coverOk) {
      const docsResult = await this.orchestrator.runDocumentsPipeline(
        userId,
        jobId,
      );
      const failed = docsResult.steps.filter((s) => !s.success);
      if (failed.length) {
        throw new BadRequestException(
          failed.map((s) => s.error || s.summary).join('; '),
        );
      }
      resume = await findDoc(DocumentType.RESUME);
      coverLetter = await findDoc(DocumentType.COVER_LETTER);
    }

    if (!resume || !coverLetter) {
      throw new BadRequestException('Could not generate CV and cover letter');
    }

    const finalResumePath =
      typeof resume.metadata?.filePath === 'string'
        ? resume.metadata.filePath
        : null;
    const finalCoverPath =
      typeof coverLetter.metadata?.filePath === 'string'
        ? coverLetter.metadata.filePath
        : null;

    if (
      !finalResumePath ||
      !(await this.fileExists(finalResumePath)) ||
      !finalCoverPath ||
      !(await this.fileExists(finalCoverPath))
    ) {
      throw new BadRequestException('PDF attachments are missing on disk');
    }

    void applicationId;
    return {
      resume,
      coverLetter,
      resumePath: finalResumePath,
      coverPath: finalCoverPath,
    };
  }

  private async draftApplicationEmail(options: {
    profile: Profile;
    job: Job;
    to: string;
    customMessage?: string;
  }): Promise<{ subject: string; body: string }> {
    if (options.customMessage?.trim()) {
      return {
        subject: `Application: ${options.job.title} — ${options.profile.fullName || 'Candidate'}`,
        body: options.customMessage.trim(),
      };
    }

    const system = `You write short, professional job-application emails.
Return ONLY valid JSON: { "subject": string, "body": string }
Rules:
- Body must be plain text, 120-220 words.
- Mention CV and cover letter are attached.
- Use only facts from the candidate profile.
- No placeholders like [Company].`;

    const prompt = `Write an application email.

Candidate: ${options.profile.fullName ?? 'Candidate'}
Headline: ${options.profile.headline ?? ''}
Email: ${options.profile.userId}
Skills: ${(options.profile.skills ?? []).slice(0, 15).join(', ')}

Role: ${options.job.title}
Company: ${options.job.company}
Location: ${options.job.location ?? 'n/a'}
Recipient: ${options.to}
Job description (excerpt):
${options.job.description.slice(0, 1200)}`;

    const text = await this.ai.generateForAgent(system, prompt);
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = (fenced?.[1] ?? text).trim();
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      const parsed = JSON.parse(raw.slice(start, end + 1)) as {
        subject?: string;
        body?: string;
      };
      if (parsed.subject && parsed.body) {
        return { subject: parsed.subject, body: parsed.body };
      }
    } catch {
      // fall through
    }

    return {
      subject: `Application: ${options.job.title} — ${options.profile.fullName || 'Candidate'}`,
      body: `Dear Hiring Team,\n\nI am writing to apply for the ${options.job.title} role at ${options.job.company}. Please find my CV and cover letter attached.\n\nKind regards,\n${options.profile.fullName || 'Candidate'}`,
    };
  }

  private pdfFilename(doc: Document, fallback: string): string {
    const base = (doc.title || fallback)
      .replace(/[^\w.\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 60);
    const pathName =
      typeof doc.metadata?.filePath === 'string'
        ? basename(doc.metadata.filePath)
        : `${base}.pdf`;
    return pathName.endsWith('.pdf') ? pathName : `${base}.pdf`;
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private matchApplication(
    haystack: string,
    jobs: Job[],
    apps: Application[],
  ): { jobId: string | null; applicationId: string | null } {
    const text = haystack.toLowerCase();
    const jobsById = new Map(jobs.map((j) => [j.id, j]));

    for (const app of apps) {
      const job = jobsById.get(app.jobId);
      if (!job) continue;
      const company = job.company.toLowerCase();
      const title = job.title.toLowerCase();
      if (
        (company.length > 2 && text.includes(company)) ||
        (title.length > 4 && text.includes(title))
      ) {
        return { jobId: job.id, applicationId: app.id };
      }
    }

    for (const job of jobs) {
      const company = job.company.toLowerCase();
      if (company.length > 2 && text.includes(company)) {
        const app = apps.find((a) => a.jobId === job.id);
        return { jobId: job.id, applicationId: app?.id ?? null };
      }
    }

    return { jobId: null, applicationId: null };
  }
}
