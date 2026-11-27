import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { QuestionsService } from './questions.service.js';
import type { GenerateInput, EvaluateInput } from "../shared/contracts.js";

@Controller('api/questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  async findAll(@Query('topicId') topicId?: string, @Query('type') type?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.questionsService.findAll({ topicId, type, from, to });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Get(':id/attempts')
  async findAttempts(@Param('id') id: string) {
    return this.questionsService.findAttempts(id);
  }

  @Post('generate')
  generate(@Body() input: GenerateInput) {
    return this.questionsService.generate(input);
  }

  @Post(':id/evaluate')
  evaluate(@Param('id') id: string, @Body() input: EvaluateInput) {
    return this.questionsService.evaluate(id, input);
  }

  @Post(':id/hint')
  hint(@Param('id') id: string, @Body() input: { hintCount: number }) {
    return this.questionsService.hint(id, input.hintCount);
  }

  @Post(':id/follow-up')
  followUp(@Param('id') id: string) {
    return this.questionsService.followUp(id);
  }
}
