import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { access } from 'fs/promises';
import { Repository } from 'typeorm';
import {
  Application,
  ApplicationStatus,
  Document,
} from '../../lib/database/entities';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applications: Repository<Application>,
    @InjectRepository(Document)
    private readonly documents: Repository<Document>,
  ) {}

  listByUser(userId: string): Promise<Application[]> {
    return this.applications.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async get(userId: string, id: string): Promise<Application> {
    const app = await this.applications.findOne({ where: { id, userId } });
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async updateStatus(
    userId: string,
    id: string,
    status: ApplicationStatus,
  ): Promise<Application> {
    const app = await this.get(userId, id);
    app.status = status;
    if (status === ApplicationStatus.APPLIED && !app.submittedAt) {
      app.submittedAt = new Date();
    }
    return this.applications.save(app);
  }

  async approveAutoSubmit(userId: string, id: string): Promise<Application> {
    const app = await this.get(userId, id);
    app.autoSubmitApproved = true;
    return this.applications.save(app);
  }

  async dashboard(userId: string) {
    const apps = await this.listByUser(userId);
    const count = (status: ApplicationStatus) =>
      apps.filter((a) => a.status === status).length;

    return {
      jobsFoundToday: apps.filter((a) => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return a.createdAt >= start;
      }).length,
      applied: count(ApplicationStatus.APPLIED),
      waiting: count(ApplicationStatus.WAITING),
      interview: count(ApplicationStatus.INTERVIEW),
      rejected: count(ApplicationStatus.REJECTED),
      offer: count(ApplicationStatus.OFFER),
      found: count(ApplicationStatus.FOUND),
      total: apps.length,
    };
  }

  listDocuments(userId: string, applicationId?: string) {
    return this.documents.find({
      where: applicationId ? { userId, applicationId } : { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getDocument(userId: string, documentId: string): Promise<Document> {
    const doc = await this.documents.findOne({
      where: { id: documentId, userId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async getDocumentPdfPath(
    userId: string,
    documentId: string,
  ): Promise<{ filePath: string; title: string }> {
    const doc = await this.getDocument(userId, documentId);
    const filePath =
      typeof doc.metadata?.filePath === 'string' ? doc.metadata.filePath : null;
    if (!filePath) {
      throw new NotFoundException('PDF not generated for this document');
    }
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException('PDF file missing on disk');
    }
    return { filePath, title: doc.title };
  }
}
