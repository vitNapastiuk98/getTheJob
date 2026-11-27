import { Module } from '@nestjs/common';
import { DesignController } from './design.controller.js';
import { DesignService } from './design.service.js';

@Module({
  controllers: [DesignController],
  providers: [DesignService],
})
export class DesignModule {}
