import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateJobDto, JobsService } from './jobs.service';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('user/:userId')
  @ApiOperation({ summary: 'List jobs for a user' })
  list(@Param('userId') userId: string) {
    return this.jobsService.listByUser(userId);
  }

  @Get(':userId/:id')
  @ApiOperation({ summary: 'Get a job' })
  get(@Param('userId') userId: string, @Param('id') id: string) {
    return this.jobsService.get(userId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Manually add a job listing' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'title', 'company', 'description'],
      properties: {
        userId: { type: 'string' },
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
  create(@Body() body: CreateJobDto) {
    return this.jobsService.create(body);
  }
}
