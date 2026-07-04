import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../../middleware/decorators/current-user.decorator';
import { CreateJobDto, JobsService } from './jobs.service';

@ApiTags('Jobs')
@ApiBearerAuth('Authorization')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'List jobs for the authenticated user' })
  list(@CurrentUser() user: AuthUser) {
    return this.jobsService.listByUser(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a job owned by the authenticated user' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.jobsService.get(user.userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Manually add a job listing' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'company', 'description'],
      properties: {
        title: { type: 'string' },
        company: { type: 'string' },
        description: { type: 'string' },
        location: { type: 'string' },
        remote: { type: 'boolean' },
        source: { type: 'string' },
        sourceUrl: { type: 'string' },
        salaryMin: { type: 'number' },
        salaryMax: { type: 'number' },
        currency: { type: 'string' },
      },
    },
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: Omit<CreateJobDto, 'userId'>,
  ) {
    return this.jobsService.create({ ...body, userId: user.userId });
  }
}
