import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { readFile } from 'fs/promises';
import {
  CurrentUser,
  type AuthUser,
} from '../../middleware/decorators/current-user.decorator';
import { Public } from '../../middleware/decorators/public.decorator';
import { EmailsService } from './emails.service';

@ApiTags('Emails')
@Controller('emails')
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @ApiBearerAuth('Authorization')
  @ApiOperation({ summary: 'Gmail configuration status' })
  status() {
    return this.emailsService.status();
  }

  @Get()
  @ApiBearerAuth('Authorization')
  @ApiOperation({ summary: 'List classified inbox / outbound emails' })
  list(@CurrentUser() user: AuthUser) {
    return this.emailsService.list(user.userId);
  }

  @Post('ingest')
  @ApiBearerAuth('Authorization')
  @ApiOperation({
    summary: 'Ingest and classify an email (paste recruiter mail)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['body'],
      properties: {
        fromAddress: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        applicationId: { type: 'string' },
        jobId: { type: 'string' },
      },
    },
  })
  ingest(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      fromAddress?: string;
      subject?: string;
      body: string;
      applicationId?: string;
      jobId?: string;
    },
  ) {
    return this.emailsService.ingest({
      userId: user.userId,
      fromAddress: body.fromAddress,
      subject: body.subject,
      body: body.body,
      applicationId: body.applicationId,
      jobId: body.jobId,
      source: 'dashboard',
    });
  }

  @Post('apply')
  @ApiBearerAuth('Authorization')
  @ApiOperation({
    summary:
      'Email CV + cover letter via Gmail for a job application (generates PDFs if needed)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jobId', 'to'],
      properties: {
        jobId: { type: 'string' },
        to: {
          type: 'string',
          description: 'Hiring manager / jobs@ inbox address',
        },
        applicationId: { type: 'string' },
        customMessage: { type: 'string' },
      },
    },
  })
  apply(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      jobId: string;
      to: string;
      applicationId?: string;
      customMessage?: string;
    },
  ) {
    return this.emailsService.sendApplication(user.userId, body);
  }

  @Post('sync-inbox')
  @ApiBearerAuth('Authorization')
  @ApiOperation({
    summary: 'Pull recent Gmail inbox messages and classify them',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  })
  syncInbox(@CurrentUser() user: AuthUser, @Body() body: { limit?: number }) {
    return this.emailsService.syncInbox(user.userId, body.limit ?? 10);
  }

  @Post(':id/calendar')
  @ApiBearerAuth('Authorization')
  @ApiOperation({
    summary:
      'Schedule interview/assessment on calendar (ICS always; Google Calendar when configured)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'ISO datetime override' },
        durationMinutes: { type: 'number' },
      },
    },
  })
  scheduleCalendar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { start?: string; durationMinutes?: number },
  ) {
    return this.emailsService.scheduleFromEmail(user.userId, id, body);
  }

  @Get(':id/calendar.ics')
  @ApiBearerAuth('Authorization')
  @ApiOperation({ summary: 'Download .ics invite for a classified email' })
  async downloadIcs(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { filePath, title } = await this.emailsService.getCalendarIcs(
      user.userId,
      id,
    );
    const buffer = await readFile(filePath);
    const safeName = title.replace(/[^\w.-]+/g, '_').slice(0, 60);
    return new StreamableFile(buffer, {
      type: 'text/calendar',
      disposition: `attachment; filename="${safeName}.ics"`,
      length: buffer.length,
    });
  }

  @Get(':id')
  @ApiBearerAuth('Authorization')
  @ApiOperation({ summary: 'Get one email record' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.emailsService.get(user.userId, id);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({
    summary:
      'Inbound email webhook (Resend/generic). Requires x-webhook-secret header.',
  })
  async webhook(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const expected = this.config.get<string>('EMAIL_WEBHOOK_SECRET');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const data =
      body.data && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : body;

    const fromAddress =
      (data.from as string) || (data.fromAddress as string) || undefined;
    const subject = (data.subject as string) || undefined;
    const text =
      (data.text as string) ||
      (data.body as string) ||
      (data.html as string) ||
      '';
    const userId =
      (body.userId as string) ||
      (data.userId as string) ||
      this.config.get<string>('EMAIL_INBOX_USER_ID') ||
      '';

    if (!userId) {
      throw new UnauthorizedException(
        'userId missing — set EMAIL_INBOX_USER_ID or pass userId in payload',
      );
    }

    return this.emailsService.ingest({
      userId: userId.trim().toLowerCase(),
      fromAddress,
      subject,
      body: text,
      source: 'webhook',
    });
  }
}
