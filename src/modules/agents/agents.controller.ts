import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentId } from '../../lib/database/entities';
import { OrchestratorService } from './orchestrator/orchestrator.service';

@ApiTags('Agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Get()
  @ApiOperation({ summary: 'List agents and their responsibilities' })
  listAgents() {
    return this.orchestrator.listAgents();
  }

  @Post('run')
  @ApiOperation({ summary: 'Run a single agent' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['agentId', 'userId'],
      properties: {
        agentId: { type: 'string', enum: Object.values(AgentId) },
        userId: { type: 'string' },
        jobId: { type: 'string' },
        applicationId: { type: 'string' },
        input: { type: 'object' },
      },
    },
  })
  runAgent(
    @Body()
    body: {
      agentId: AgentId;
      userId: string;
      jobId?: string;
      applicationId?: string;
      input?: Record<string, unknown>;
    },
  ) {
    return this.orchestrator.runAgent(body.agentId, body.userId, {
      jobId: body.jobId,
      applicationId: body.applicationId,
      input: body.input,
    });
  }

  @Post('pipeline/discover')
  @ApiOperation({
    summary: 'Discovery pipeline: find jobs then match each to profile',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId'],
      properties: {
        userId: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  })
  discover(@Body() body: { userId: string; query?: string; limit?: number }) {
    return this.orchestrator.runDiscoveryPipeline(body.userId, {
      query: body.query,
      limit: body.limit,
    });
  }

  @Post('pipeline/documents')
  @ApiOperation({
    summary:
      'Documents pipeline: tailored CV + cover letter from your master experience only',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'jobId'],
      properties: {
        userId: { type: 'string' },
        jobId: { type: 'string' },
      },
    },
  })
  documents(@Body() body: { userId: string; jobId: string }) {
    return this.orchestrator.runDocumentsPipeline(body.userId, body.jobId);
  }

  @Post('pipeline/apply')
  @ApiOperation({
    summary:
      'Apply pipeline: match → resume → cover letter → answers → browser plan',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'jobId'],
      properties: {
        userId: { type: 'string' },
        jobId: { type: 'string' },
        questions: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  apply(
    @Body()
    body: {
      userId: string;
      jobId: string;
      questions?: string[];
    },
  ) {
    return this.orchestrator.runApplyPipeline(body.userId, body.jobId, {
      questions: body.questions,
    });
  }

  @Post('pipeline/insights')
  @ApiOperation({ summary: 'Insights pipeline: analytics then career coach' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId'],
      properties: { userId: { type: 'string' } },
    },
  })
  insights(@Body() body: { userId: string }) {
    return this.orchestrator.runInsightsPipeline(body.userId);
  }

  @Get(':agentId')
  @ApiOperation({ summary: 'Get one agent descriptor' })
  getAgent(@Param('agentId') agentId: AgentId) {
    return this.orchestrator.listAgents().find((a) => a.id === agentId) ?? null;
  }
}
