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
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';
import {
  assertProfileHasExperience,
  buildExperienceSourceBlock,
} from '../shared/profile-context';

@Injectable()
export class CoverLetterAgent extends BaseAgent {
  readonly id = AgentId.COVER_LETTER;
  readonly name = 'Cover Letter Agent';
  readonly responsibilities = [
    'Write a tailored cover letter for each job',
    'Ground every claim in the candidate’s real experience',
    'Connect specific past work to the job requirements',
    'Never invent motivations, achievements, or employers',
  ];

  protected readonly systemPrompt = `You are the Cover Letter Agent for RemoteHask.

Your job: write a short, specific cover letter for ONE job using ONLY the candidate's real experience.

You MUST:
- Open with substance (no "I am writing to apply" / "Dear Hiring Manager" fluff templates).
- Reference 1–3 concrete experiences from the profile that map to the job.
- Sound like this specific person applying to this specific company/role.
- Stay honest about fit; do not oversell skills that are not in the profile.

You MUST NOT:
- Invent employers, projects, metrics, or personal stories.
- Use a generic template that could apply to any job.
- Claim passion for the company without tying it to something real in the profile or JD.

If the profile lacks a relevant example, write a shorter letter and avoid fake anecdotes.

Return ONLY valid JSON:
{
  "title": string,
  "content": string,
  "experienceReferenced": string[],
  "omittedGaps": string[]
}
content must be markdown or plain prose. experienceReferenced = profile facts you used. omittedGaps = JD asks you could not support.`;

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
      return this.fail('Job is required for cover letter generation');
    }

    const profile = ctx.profile!;
    const prompt = `Write a tailored cover letter using ONLY the candidate experience below.

${buildExperienceSourceBlock(profile)}

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
        experienceReferenced?: string[];
        omittedGaps?: string[];
      }>(text);
      if (!parsed?.content?.trim()) {
        return this.fail('Cover letter agent returned invalid JSON');
      }

      let doc = await this.documents.save(
        this.documents.create({
          userId: ctx.userId,
          jobId: ctx.job.id,
          applicationId: ctx.application?.id ?? null,
          type: DocumentType.COVER_LETTER,
          title:
            parsed.title ||
            `Cover letter — ${ctx.job.title} @ ${ctx.job.company}`,
          content: parsed.content,
          metadata: {
            tailoredToJobId: ctx.job.id,
            experienceReferenced: parsed.experienceReferenced ?? [],
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

      return this.ok('Tailored cover letter generated from your experience', {
        documentId: doc.id,
        title: doc.title,
        content: doc.content,
        filePath,
        experienceReferenced: parsed.experienceReferenced ?? [],
        omittedGaps: parsed.omittedGaps ?? [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }
}
