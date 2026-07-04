import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../../lib/database/entities';

export type CreateJobDto = {
  userId: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  remote?: boolean;
  source?: string;
  sourceUrl?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
};

@Injectable()
export class JobsService {
  constructor(@InjectRepository(Job) private readonly jobs: Repository<Job>) {}

  create(dto: CreateJobDto): Promise<Job> {
    return this.jobs.save(
      this.jobs.create({
        userId: dto.userId,
        title: dto.title,
        company: dto.company,
        description: dto.description,
        location: dto.location ?? null,
        remote: dto.remote ?? false,
        source: dto.source ?? 'manual',
        sourceUrl: dto.sourceUrl ?? null,
        salaryMin: dto.salaryMin ?? null,
        salaryMax: dto.salaryMax ?? null,
        currency: dto.currency ?? null,
        missingSkills: [],
        matchedSkills: [],
        metadata: {},
      }),
    );
  }

  listByUser(userId: string): Promise<Job[]> {
    return this.jobs.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async get(userId: string, id: string): Promise<Job> {
    const job = await this.jobs.findOne({ where: { id, userId } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }
}
