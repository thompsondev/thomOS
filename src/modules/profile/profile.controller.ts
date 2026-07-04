import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../middleware/decorators/current-user.decorator';
import { ProfileService } from './profile.service';
import type { UpsertProfileDto } from './profile.types';

@ApiTags('Profile')
@ApiBearerAuth('Authorization')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get master profile for the authenticated user' })
  getMine(@CurrentUser() user: AuthUser) {
    return this.profileService.getByUserId(user.userId);
  }

  @Post('seed/master')
  @ApiOperation({
    summary:
      'Load / refresh Thompson master resume onto the authenticated user profile',
  })
  seedMaster(@CurrentUser() user: AuthUser) {
    return this.profileService.seedThompsonProfileForUser(user.userId);
  }

  @Put('me')
  @ApiOperation({ summary: 'Create or update master profile for current user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        headline: { type: 'string' },
        summary: { type: 'string' },
        phone: { type: 'string', example: '+234 805 198 6863' },
        linkedinUrl: {
          type: 'string',
          example: 'https://linkedin.com/in/your-handle',
        },
        masterResume: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' } },
        filters: { type: 'object' },
        experience: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  upsertMine(
    @CurrentUser() user: AuthUser,
    @Body() body: Omit<UpsertProfileDto, 'userId'>,
  ) {
    return this.profileService.upsert({ ...body, userId: user.userId });
  }
}
