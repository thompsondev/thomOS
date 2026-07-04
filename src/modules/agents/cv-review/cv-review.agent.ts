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
import {
  detectMarkdownArtifacts,
  normalizeCvContent,
} from '../../../lib/pdf/cv-plain-text';
import { BaseAgent } from '../base/base.agent';
import type { AgentContext, AgentResult } from '../agents.types';

@Injectable()
export class CvReviewAgent extends BaseAgent {
  readonly id = AgentId.CV_REVIEW;
  readonly name = 'CV Review Agent';
  readonly responsibilities = [
    'Review tailored CVs for professional quality and clarity',
    'Remove markdown, clutter, and formatting artifacts',
    'Enforce concise bullets and ATS-friendly plain-text structure',
    'Polish wording while keeping every fact from the original draft',
  ];

  protected readonly systemPrompt = `You are the CV Review Agent for RemoteHask — a senior recruiter and professional CV editor.

Review and polish ONE tailored CV draft. Your output must read like a clean, professional human-written resume — not AI markdown.

STANDARDS:
- Plain text ONLY. No markdown: no #, ##, ###, **, backticks, or [links](url).
- Section headers in ALL CAPS on their own line (e.g. PROFESSIONAL SUMMARY, EXPERIENCE, SKILLS).
- Contact line under the name: City | Phone | Email | LinkedIn | GitHub (only include what exists in the draft).
- Max 4 strong bullets per role; cut weak or duplicate bullets.
- Each bullet: one line, starts with a strong past-tense verb, includes a metric when the draft already has one.
- Role lines: Job Title | Company | Location | Dates on one line.
- Summary: 2–3 tight sentences, no buzzword stuffing.
- Skills: one comma-separated line or a short grouped list — not a wall of tags.
- Single-column, ATS-friendly. No tables, icons, or decorative formatting.
- Do NOT invent employers, titles, dates, skills, or metrics.
- Do NOT add content that was not in the draft.

Return ONLY valid JSON:
{
  "content": string,
  "qualityScore": number,
  "issuesFixed": string[],
  "remainingConcerns": string[],
  "approved": boolean
}
qualityScore is 0–100. approved is true only if the CV meets professional standards with no markdown artifacts.`;

  constructor(
    ai: AiService,
    private readonly pdf: PdfService,
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
  ) {
    super(ai);
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const draft = await this.resolveDraft(ctx);
    if (!draft) {
      return this.fail(
        'CV draft is required — run the resume agent first or pass documentId in input',
      );
    }

    const prompt = `Review and polish this CV draft for professional quality.

TARGET ROLE: ${ctx.job?.title ?? 'n/a'} at ${ctx.job?.company ?? 'n/a'}

DRAFT CV:
${draft.content}

Issues detected in draft: ${detectMarkdownArtifacts(draft.content).join(', ') || 'none auto-detected'}

Return polished plain-text CV in "content". Fix all markdown and clutter.`;

    try {
      const text = await this.think(prompt);
      const parsed = this.parseJson<{
        content: string;
        qualityScore?: number;
        issuesFixed?: string[];
        remainingConcerns?: string[];
        approved?: boolean;
      }>(text);

      if (!parsed?.content?.trim()) {
        return this.fail('CV review agent returned invalid JSON');
      }

      let polished = normalizeCvContent(parsed.content);
      const leftover = detectMarkdownArtifacts(polished);
      if (leftover.length) {
        polished = normalizeCvContent(polished);
      }

      draft.doc.content = polished;
      draft.doc.metadata = {
        ...draft.doc.metadata,
        reviewed: true,
        qualityScore: parsed.qualityScore ?? null,
        issuesFixed: parsed.issuesFixed ?? [],
        remainingConcerns: parsed.remainingConcerns ?? [],
        approved: parsed.approved ?? leftover.length === 0,
        reviewedAt: new Date().toISOString(),
      };

      let saved = await this.documents.save(draft.doc);

      const filePath = await this.pdf.renderMarkdownToPdf({
        userId: ctx.userId,
        documentId: saved.id,
        title: saved.title,
        content: saved.content,
      });
      saved.metadata = { ...saved.metadata, filePath };
      saved = await this.documents.save(saved);

      return this.ok('CV reviewed and polished for professional presentation', {
        documentId: saved.id,
        title: saved.title,
        content: saved.content,
        filePath,
        qualityScore: parsed.qualityScore ?? null,
        issuesFixed: parsed.issuesFixed ?? [],
        remainingConcerns: parsed.remainingConcerns ?? [],
        approved: parsed.approved ?? leftover.length === 0,
        markdownArtifactsRemoved: leftover.length === 0,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(message);
      return this.fail(message);
    }
  }

  private async resolveDraft(
    ctx: AgentContext,
  ): Promise<{ doc: Document; content: string } | null> {
    const documentId = ctx.input?.documentId as string | undefined;
    if (documentId) {
      const doc = await this.documents.findOne({
        where: { id: documentId, userId: ctx.userId },
      });
      if (doc?.content?.trim()) {
        return { doc, content: doc.content };
      }
    }

    const draftContent = ctx.input?.draftContent as string | undefined;
    if (draftContent?.trim()) {
      const doc = documentId
        ? await this.documents.findOne({
            where: { id: documentId, userId: ctx.userId },
          })
        : null;
      if (doc) return { doc, content: draftContent };
    }

    if (ctx.job) {
      const rows = await this.documents.find({
        where: {
          userId: ctx.userId,
          jobId: ctx.job.id,
          type: DocumentType.RESUME,
        },
        order: { createdAt: 'DESC' },
        take: 1,
      });
      const doc = rows[0];
      if (doc?.content?.trim()) {
        return { doc, content: doc.content };
      }
    }

    if (draftContent?.trim()) {
      return null;
    }

    return null;
  }
}
