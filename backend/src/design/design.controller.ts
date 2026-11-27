import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { DesignService } from './design.service.js';

@Controller('api/design')
export class DesignController {
  constructor(private readonly designService: DesignService) {}

  @Get('scenarios')
  getScenarios() {
    return this.designService.getScenarios();
  }

  @Post('scenarios/generate')
  generateScenario(@Body() body: { focus?: string }) {
    return this.designService.generateScenario(body.focus ?? '');
  }

  @Get('sessions')
  getSessions() {
    return this.designService.getSessions();
  }

  @Post('sessions')
  createSession(@Body() body: { title: string; brief: string }) {
    return this.designService.createSession(body);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.designService.getSession(id);
  }

  @Post('sessions/:id/drafts')
  createDraft(@Param('id') id: string, @Body() body: { content: string }) {
    return this.designService.createDraft(id, body.content);
  }

  @Post('sessions/:id/messages')
  submitMessage(@Param('id') id: string, @Body() body: { content?: string; retryId?: string }) {
    return this.designService.submitMessage(id, body);
  }
}
