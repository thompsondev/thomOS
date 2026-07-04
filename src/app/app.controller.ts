import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from '../middleware/decorators/public.decorator';

@ApiTags('Server')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('branding')
  getBranding(@Req() req: Request): {
    authorName: string | null;
    authorUrl: string | null;
  } {
    const host = req.get('Host');
    return this.appService.getBranding(host ?? undefined);
  }
}
