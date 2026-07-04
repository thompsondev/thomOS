import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApplicationStatus } from '../../lib/database/entities';
import { ApplicationsService } from './applications.service';

@ApiTags('Applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get('dashboard/:userId')
  @ApiOperation({ summary: 'Dashboard counts for applications' })
  dashboard(@Param('userId') userId: string) {
    return this.applicationsService.dashboard(userId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'List applications for a user' })
  list(@Param('userId') userId: string) {
    return this.applicationsService.listByUser(userId);
  }

  @Get('documents/:userId')
  @ApiOperation({ summary: 'List generated documents for a user' })
  documents(@Param('userId') userId: string) {
    return this.applicationsService.listDocuments(userId);
  }

  @Get(':userId/:id')
  @ApiOperation({ summary: 'Get an application' })
  get(@Param('userId') userId: string, @Param('id') id: string) {
    return this.applicationsService.get(userId, id);
  }

  @Patch(':userId/:id/status')
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
    @Param('userId') userId: string,
    @Param('id') id: string,
    @Body() body: { status: ApplicationStatus },
  ) {
    return this.applicationsService.updateStatus(userId, id, body.status);
  }

  @Patch(':userId/:id/approve-submit')
  @ApiOperation({
    summary: 'Approve auto-submit for this application (browser agent)',
  })
  approveSubmit(@Param('userId') userId: string, @Param('id') id: string) {
    return this.applicationsService.approveAutoSubmit(userId, id);
  }
}
