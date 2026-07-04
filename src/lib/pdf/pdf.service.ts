import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import PDFDocument from 'pdfkit';

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

      doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'left' });
      doc.moveDown(0.75);
      doc.fontSize(10).font('Helvetica');

      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trimEnd();
        if (!trimmed) {
          doc.moveDown(0.4);
          continue;
        }
        if (trimmed.startsWith('# ')) {
          doc.moveDown(0.3);
          doc.fontSize(14).font('Helvetica-Bold').text(trimmed.slice(2));
          doc.fontSize(10).font('Helvetica');
          continue;
        }
        if (trimmed.startsWith('## ')) {
          doc.moveDown(0.25);
          doc.fontSize(12).font('Helvetica-Bold').text(trimmed.slice(3));
          doc.fontSize(10).font('Helvetica');
          continue;
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          doc.text(`• ${trimmed.slice(2)}`, { indent: 12 });
          continue;
        }
        const boldStripped = trimmed.replace(/\*\*(.*?)\*\*/g, '$1');
        doc.text(boldStripped, { align: 'left' });
      }

      doc.end();
    });
  }
}
