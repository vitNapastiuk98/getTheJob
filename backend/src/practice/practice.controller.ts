import { Controller, Post, Param, Body } from '@nestjs/common';
import { PracticeService } from './practice.service.js';

@Controller('api/practice')
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post('generate')
  generate(@Body() body: { topicId: string; subtopicIds: string[]; difficulty: string; runtime: string }) {
    return this.practiceService.generate(body);
  }

  @Post(':id/review')
  review(@Param('id') id: string, @Body() body: { code: string }) {
    return this.practiceService.review(id, body.code);
  }
}
