import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../../lib/database/entities';
import {
  THOMPSON_USER_ID,
  thompsonOpeyemiProfile,
} from './data/thompson-opeyemi.profile';
import type { UpsertProfileDto } from './profile.types';

export type { UpsertProfileDto } from './profile.types';

@Injectable()
export class ProfileService implements OnModuleInit {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profiles: Repository<Profile>,
  ) {}

  async onModuleInit() {
    await this.seedThompsonProfileForUser(THOMPSON_USER_ID);
  }

  /** Load / refresh Thompson's resume onto a user id (defaults to Thompson's email). */
  async seedThompsonProfileForUser(
    userId: string = THOMPSON_USER_ID,
  ): Promise<Profile> {
    const profile = await this.upsert({
      ...thompsonOpeyemiProfile,
      userId,
    });
    this.logger.log(`Master profile ready for ${userId}`);
    return profile;
  }

  async upsert(dto: UpsertProfileDto): Promise<Profile> {
    let profile = await this.profiles.findOne({
      where: { userId: dto.userId },
    });

    if (!profile) {
      profile = this.profiles.create({
        userId: dto.userId,
        fullName: dto.fullName ?? null,
        headline: dto.headline ?? null,
        summary: dto.summary ?? null,
        phone: dto.phone ?? null,
        linkedinUrl: dto.linkedinUrl ?? null,
        githubUrl: dto.githubUrl ?? null,
        masterResume: dto.masterResume ?? '',
        skills: dto.skills ?? [],
        filters: dto.filters ?? {},
        experience: dto.experience ?? [],
      });
    } else {
      if (dto.fullName !== undefined) profile.fullName = dto.fullName;
      if (dto.headline !== undefined) profile.headline = dto.headline;
      if (dto.summary !== undefined) profile.summary = dto.summary;
      if (dto.phone !== undefined) profile.phone = dto.phone;
      if (dto.linkedinUrl !== undefined) profile.linkedinUrl = dto.linkedinUrl;
      if (dto.githubUrl !== undefined) profile.githubUrl = dto.githubUrl;
      if (dto.masterResume !== undefined)
        profile.masterResume = dto.masterResume;
      if (dto.skills !== undefined) profile.skills = dto.skills;
      if (dto.filters !== undefined) profile.filters = dto.filters;
      if (dto.experience !== undefined) profile.experience = dto.experience;
    }

    return this.profiles.save(profile);
  }

  async getByUserId(userId: string): Promise<Profile> {
    const profile = await this.profiles.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException(`Profile not found for user ${userId}`);
    }
    return profile;
  }
}
