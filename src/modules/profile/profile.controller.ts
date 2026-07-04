import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import type { UpsertProfileDto } from './profile.types';

@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post('seed/thompson')
  @ApiOperation({
    summary:
      'Load / refresh Thompson Opeyemi master resume (used for tailored CV & cover letters)',
  })
  seedThompson() {
    return this.profileService.seedThompsonProfile();
  }

  @Get('me/default-user-id')
  @ApiOperation({ summary: 'Default userId for the seeded master profile' })
  defaultUserId() {
    return { userId: this.profileService.getDefaultUserId() };
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get master profile for a user' })
  get(@Param('userId') userId: string) {
    return this.profileService.getByUserId(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Create or update master profile' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
        fullName: { type: 'string' },
        headline: { type: 'string' },
        summary: { type: 'string' },
        masterResume: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' } },
        filters: { type: 'object' },
        experience: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  upsert(@Body() body: UpsertProfileDto) {
    return this.profileService.upsert(body);
  }
}
