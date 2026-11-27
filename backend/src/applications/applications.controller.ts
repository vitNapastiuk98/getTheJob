import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { ApplicationsService } from './applications.service.js';
import type { ApplicationInput } from "../shared/contracts.js";

@Controller('api/applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  async findAll() {
    return this.applicationsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.applicationsService.findOne(id);
  }

  @Post()
  async create(@Body() input: ApplicationInput) {
    return this.applicationsService.create(input);
  }

  @Post(':id/generate')
  generate(@Param('id') id: string, @Body() body: { model?: string }) {
    return this.applicationsService.generate(id, body.model);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { successful?: boolean; feedback?: string }) {
    return this.applicationsService.update(id, body);
  }
}
