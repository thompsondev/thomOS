import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { readFile } from 'fs/promises';
import { ApplicationStatus } from '../../lib/database/entities';
import {
  CurrentUser,
  type AuthUser,
} from '../../middleware/decorators/current-user.decorator';
import { ApplicationsService } from './applications.service';

@ApiTags('Applications')
@ApiBearerAuth('Authorization')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard counts for the authenticated user' })
  dashboard(@CurrentUser() user: AuthUser) {
    return this.applicationsService.dashboard(user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List applications for the authenticated user' })
  list(@CurrentUser() user: AuthUser) {
    return this.applicationsService.listByUser(user.userId);
  }

  @Get('documents')
  @ApiOperation({
    summary: 'List generated documents for the authenticated user',
  })
  documents(@CurrentUser() user: AuthUser) {
    return this.applicationsService.listDocuments(user.userId);
  }

  @Get('documents/:documentId/pdf')
  @ApiOperation({ summary: 'Download tailored document as PDF' })
  async downloadPdf(
    @CurrentUser() user: AuthUser,
    @Param('documentId') documentId: string,
  ): Promise<StreamableFile> {
    const { filePath, title } =
      await this.applicationsService.getDocumentPdfPath(
        user.userId,
        documentId,
      );
    const safeName = title.replace(/[^\w.-]+/g, '_').slice(0, 80);
    const buffer = await readFile(filePath);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${safeName}.pdf"`,
      length: buffer.length,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an application' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.applicationsService.get(user.userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update application status' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: Object.values(ApplicationStatus),
        },
      },
    },
  })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: ApplicationStatus },
  ) {
    return this.applicationsService.updateStatus(user.userId, id, body.status);
  }

  @Patch(':id/approve-submit')
  @ApiOperation({
    summary: 'Approve auto-submit for this application (browser agent)',
  })
  approveSubmit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.applicationsService.approveAutoSubmit(user.userId, id);
  }
}
