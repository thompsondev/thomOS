import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import PDFDocument from 'pdfkit';
import {
  isBulletLine,
  isSectionHeader,
  normalizeCvContent,
  stripMarkdownSyntax,
  toBulletText,
} from './cv-plain-text';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly storageRoot = join(process.cwd(), 'storage', 'documents');

  async renderMarkdownToPdf(options: {
    userId: string;
    documentId: string;
    title: string;
    content: string;
  }): Promise<string> {
    const filePath = join(
      this.storageRoot,
      options.userId,
      `${options.documentId}.pdf`,
    );
    await mkdir(dirname(filePath), { recursive: true });

    const buffer = await this.buildPdfBuffer(options.title, options.content);
    await writeFile(filePath, buffer);
    this.logger.log(`PDF written: ${filePath}`);
    return filePath;
  }

  private buildPdfBuffer(title: string, content: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 50,
        size: 'LETTER',
        info: { Title: title },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const normalized = normalizeCvContent(content);
      const lines = normalized.split(/\r?\n/);
      let lineIndex = 0;

      while (lineIndex < lines.length && !lines[lineIndex].trim()) lineIndex++;
      if (lineIndex < lines.length) {
        const first = stripMarkdownSyntax(lines[lineIndex]);
        if (
          first.length <= 60 &&
          !isSectionHeader(first) &&
          !isBulletLine(first)
        ) {
          doc
            .fontSize(18)
            .font('Helvetica-Bold')
            .text(first, { align: 'left' });
          doc.moveDown(0.35);
          lineIndex++;
        }
      }

      doc.fontSize(10).font('Helvetica');

      for (; lineIndex < lines.length; lineIndex++) {
        const raw = lines[lineIndex];
        const trimmed = raw.trim();

        if (!trimmed) {
          doc.moveDown(0.35);
          continue;
        }

        const line = stripMarkdownSyntax(raw);

        if (isSectionHeader(line)) {
          doc.moveDown(0.45);
          doc.fontSize(11).font('Helvetica-Bold').text(line, {
            characterSpacing: 0.6,
          });
          doc.moveDown(0.15);
          doc.fontSize(10).font('Helvetica');
          continue;
        }

        if (isBulletLine(line)) {
          doc.text(`• ${toBulletText(line)}`, {
            indent: 14,
            paragraphGap: 2,
          });
          continue;
        }

        if (line.includes('|') || /\b(20\d{2}|Present)\b/.test(line)) {
          doc.moveDown(0.15);
          doc.font('Helvetica-Bold').text(line);
          doc.font('Helvetica');
          continue;
        }

        doc.text(line, { align: 'left', paragraphGap: 2 });
      }

      doc.end();
    });
  }
}
