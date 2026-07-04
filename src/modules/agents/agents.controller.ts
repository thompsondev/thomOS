import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentId } from '../../lib/database/entities';
import {
  CurrentUser,
  type AuthUser,
} from '../../middleware/decorators/current-user.decorator';
import { OrchestratorService } from './orchestrator/orchestrator.service';

@ApiTags('Agents')
@ApiBearerAuth('Authorization')
@Controller('agents')
export class AgentsController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Get()
  @ApiOperation({ summary: 'List agents and their responsibilities' })
  listAgents() {
    return this.orchestrator.listAgents();
  }

  @Post('run')
  @ApiOperation({ summary: 'Run a single agent as the authenticated user' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['agentId'],
      properties: {
        agentId: { type: 'string', enum: Object.values(AgentId) },
        jobId: { type: 'string' },
        applicationId: { type: 'string' },
        input: { type: 'object' },
      },
    },
  })
  runAgent(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      agentId: AgentId;
      jobId?: string;
      applicationId?: string;
      input?: Record<string, unknown>;
    },
  ) {
    return this.orchestrator.runAgent(body.agentId, user.userId, {
      jobId: body.jobId,
      applicationId: body.applicationId,
      input: body.input,
    });
  }

  @Post('pipeline/discover')
  @ApiOperation({
    summary:
      'Discovery pipeline: fetch live boards, rank with Claude, then match',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  })
  discover(
    @CurrentUser() user: AuthUser,
    @Body() body: { query?: string; limit?: number },
  ) {
    return this.orchestrator.runDiscoveryPipeline(user.userId, {
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
      required: ['jobId'],
      properties: { jobId: { type: 'string' } },
    },
  })
  documents(@CurrentUser() user: AuthUser, @Body() body: { jobId: string }) {
    return this.orchestrator.runDocumentsPipeline(user.userId, body.jobId);
  }

  @Post('pipeline/browser')
  @ApiOperation({
    summary:
      'Run browser agent (inspect/fill). Approve submit first; set confirmSubmit to click submit.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jobId'],
      properties: {
        jobId: { type: 'string' },
        applicationId: { type: 'string' },
        confirmSubmit: { type: 'boolean' },
      },
    },
  })
  browser(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      jobId: string;
      applicationId?: string;
      confirmSubmit?: boolean;
    },
  ) {
    return this.orchestrator.runAgent(AgentId.BROWSER, user.userId, {
      jobId: body.jobId,
      applicationId: body.applicationId,
      input: { confirmSubmit: body.confirmSubmit },
    });
  }

  @Post('pipeline/apply')
  @ApiOperation({
    summary:
      'Apply pipeline: match → resume → cover letter → answers → browser plan',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jobId'],
      properties: {
        jobId: { type: 'string' },
        questions: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  apply(
    @CurrentUser() user: AuthUser,
    @Body() body: { jobId: string; questions?: string[] },
  ) {
    return this.orchestrator.runApplyPipeline(user.userId, body.jobId, {
      questions: body.questions,
    });
  }

  @Post('pipeline/insights')
  @ApiOperation({ summary: 'Insights pipeline: analytics then career coach' })
  insights(@CurrentUser() user: AuthUser) {
    return this.orchestrator.runInsightsPipeline(user.userId);
  }

  @Post('pipeline/interview-prep')
  @ApiOperation({
    summary:
      'Interview prep pipeline: focused prep pack for one job/interview (uses profile + job + optional email)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jobId'],
      properties: {
        jobId: { type: 'string' },
        applicationId: { type: 'string' },
        emailId: { type: 'string' },
        focus: { type: 'string', example: 'technical round' },
        interviewFormat: { type: 'string', example: '45-min video with hiring manager' },
        interviewAt: { type: 'string', format: 'date-time' },
        interviewNotes: { type: 'string' },
      },
    },
  })
  interviewPrep(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      jobId: string;
      applicationId?: string;
      emailId?: string;
      focus?: string;
      interviewFormat?: string;
      interviewAt?: string;
      interviewNotes?: string;
    },
  ) {
    return this.orchestrator.runInterviewPrepPipeline(user.userId, body.jobId, {
      applicationId: body.applicationId,
      emailId: body.emailId,
      input: {
        focus: body.focus,
        interviewFormat: body.interviewFormat,
        interviewAt: body.interviewAt,
        interviewNotes: body.interviewNotes,
      },
    });
  }

  @Get(':agentId')
  @ApiOperation({ summary: 'Get one agent descriptor' })
  getAgent(@Param('agentId') agentId: AgentId) {
    return this.orchestrator.listAgents().find((a) => a.id === agentId) ?? null;
  }
}
