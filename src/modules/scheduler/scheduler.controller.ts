import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentSchedulerService } from './agent-scheduler.service';

@ApiTags('Scheduler')
@ApiBearerAuth('Authorization')
@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly scheduler: AgentSchedulerService) {}

  @Get('status')
  @ApiOperation({ summary: 'Background scheduler status' })
  status() {
    return this.scheduler.status();
  }

  @Post('discovery/run')
  @ApiOperation({ summary: 'Run job discovery for all profiles now' })
  runDiscovery() {
    return this.scheduler.runDiscoveryNow();
  }

  @Post('inbox/run')
  @ApiOperation({ summary: 'Run Gmail inbox sync now' })
  runInbox() {
    return this.scheduler.runInboxSyncNow();
  }
}
