import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { MockService } from './mock.service.js';
import type { MockSetup } from "../shared/contracts.js";

@Controller('api/mock/sessions')
export class MockController {
  constructor(private readonly mockService: MockService) {}

  @Post()
  create(@Body() config: MockSetup) {
    return this.mockService.create(config);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mockService.findOne(id);
  }

  @Post(':id/next')
  next(@Param('id') id: string) {
    return this.mockService.next(id);
  }

  @Post(':id/hint')
  hint(@Param('id') id: string, @Body() body: { itemId: string }) {
    return this.mockService.hint(id, body.itemId);
  }

  @Post(':id/skip')
  skip(@Param('id') id: string, @Body() body: { itemId: string }) {
    return this.mockService.skip(id, body.itemId);
  }

  @Post(':id/answer')
  answer(@Param('id') id: string, @Body() body: { itemId: string; answer: string; requestId: string }) {
    return this.mockService.answer(id, body);
  }

  @Post(':id/end')
  end(@Param('id') id: string) {
    return this.mockService.end(id);
  }

  @Get(':id/report')
  report(@Param('id') id: string) {
    return this.mockService.report(id);
  }
}
