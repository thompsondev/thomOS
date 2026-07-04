import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgentId,
  Document,
  DocumentType,
} from '../../../lib/database/entities';
import { AiService } from '../../../lib/ai/ai.service';
import { PdfService } from '../../../lib/pdf/pdf.service';
import { normalizeCvContent } from '../../../lib/pdf/cv-plain-text';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';
import {
  assertProfileHasExperience,
  buildExperienceSourceBlock,
} from '../shared/profile-context';

@Injectable()
export class ResumeAgent extends BaseAgent {
  readonly id = AgentId.RESUME;
  readonly name = 'Resume Tailoring Agent';
  readonly responsibilities = [
    'Write a tailored CV for each job from the master profile only',
    'Extract keywords from the job description',
    'Reorder and emphasise the candidate’s real experience',
    'Never invent employment history, skills, or metrics',
  ];

  protected readonly systemPrompt = `You are the Resume Tailoring Agent for RemoteHask.

Your job: produce a tailored ATS resume for ONE job, grounded ONLY in the candidate's provided experience.

FORMAT — plain text only (NO markdown):
- Do NOT use #, ##, ###, **, backticks, or [links](url).
- Section headers in ALL CAPS on their own line: PROFESSIONAL SUMMARY, EXPERIENCE, SKILLS, EDUCATION.
- Line 1: candidate full name.
- Line 2: City | Phone | Email | LinkedIn | GitHub (only fields available in profile).
- Role header line: Job Title | Company | Location | Start – End
- Bullets: start each with "• " then one concise achievement line (max 4 bullets per role).
- Skills: comma-separated on one or two lines.

You MUST:
- Use only facts from MASTER RESUME / STRUCTURED EXPERIENCE / SKILLS in the user message.
- Reorder roles and bullets so the most relevant experience for this job comes first.
- Mirror important job keywords only when they honestly match the candidate's background.
- Keep concrete metrics that already exist in the profile; never invent numbers.

You MUST NOT:
- Invent employers, titles, dates, degrees, certifications, or tools.
- Claim skills that are not in the profile.
- Pad the resume with generic filler or buzzword clusters.

If the profile is thin for this role, write a shorter honest resume rather than fabricating fit.

Return ONLY valid JSON:
{
  "title": string,
  "content": string,
  "keywordsUsed": string[],
  "experienceHighlighted": string[],
  "omittedGaps": string[]
}
content must be plain-text professional CV (no markdown). experienceHighlighted = role/company lines you emphasised. omittedGaps = JD requirements you could not support from the profile.`;

  constructor(
    ai: AiService,
    private readonly pdf: PdfService,
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const profileError = assertProfileHasExperience(ctx.profile);
    if (profileError) return this.fail(profileError);
    if (!ctx.job) {
      return this.fail('Job is required for resume generation');
    }

    const profile = ctx.profile!;
    const prompt = `Write a tailored CV for this role using ONLY the candidate experience below.

${buildExperienceSourceBlock(profile)}

CONTACT TO USE ON CV (line 2 under name):
${[
  profile.filters?.locations?.[0],
  profile.phone,
  ctx.userId,
  profile.linkedinUrl,
  profile.githubUrl,
]
  .filter(Boolean)
  .join(' | ')}

TARGET JOB:
- Title: ${ctx.job.title}
- Company: ${ctx.job.company}
- Location: ${ctx.job.location ?? 'n/a'}
- Remote: ${ctx.job.remote}
- Description:
${ctx.job.description}`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<{
        title: string;
        content: string;
        keywordsUsed?: string[];
        experienceHighlighted?: string[];
        omittedGaps?: string[];
      }>(text);
      if (!parsed?.content?.trim()) {
        return this.fail('Resume agent returned invalid JSON');
      }

      const content = normalizeCvContent(parsed.content);

      let doc = await this.documents.save(
        this.documents.create({
          userId: ctx.userId,
          jobId: ctx.job.id,
          applicationId: ctx.application?.id ?? null,
          type: DocumentType.RESUME,
          title:
            parsed.title || `Resume — ${ctx.job.title} @ ${ctx.job.company}`,
          content,
          metadata: {
            tailoredToJobId: ctx.job.id,
            keywordsUsed: parsed.keywordsUsed ?? [],
            experienceHighlighted: parsed.experienceHighlighted ?? [],
            omittedGaps: parsed.omittedGaps ?? [],
            source: 'master_profile_only',
          },
        }),
      );

      const filePath = await this.pdf.renderMarkdownToPdf({
        userId: ctx.userId,
        documentId: doc.id,
        title: doc.title,
        content: doc.content,
      });
      doc.metadata = { ...doc.metadata, filePath };
      doc = await this.documents.save(doc);

      return this.ok('Tailored CV generated from your experience', {
        documentId: doc.id,
        title: doc.title,
        content: doc.content,
        filePath,
        keywordsUsed: parsed.keywordsUsed ?? [],
        experienceHighlighted: parsed.experienceHighlighted ?? [],
        omittedGaps: parsed.omittedGaps ?? [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
