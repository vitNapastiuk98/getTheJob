import { Controller, Get, Query } from '@nestjs/common';
import { ProgressService } from './progress.service.js';

@Controller('api')
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('dashboard')
  getDashboard() {
    return this.progressService.getDashboard();
  }

  @Get('history')
  getHistory(
    @Query('topicId') topicId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.progressService.getHistory({
      topicId: topicId || undefined,
      type: type as any || undefined,
      from: from || undefined,
      to: to || undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 100,
    });
  }

  @Get('review')
  getReview() {
    return this.progressService.getReview();
  }
}
