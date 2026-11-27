import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { OllamaModule } from './ollama/ollama.module.js';
import { PromptModule } from './prompt/prompt.module.js';
import { QuestionsModule } from './questions/questions.module.js';
import { ApplicationsModule } from './applications/applications.module.js';
import { PracticeModule } from './practice/practice.module.js';
import { MockModule } from './mock/mock.module.js';
import { DesignModule } from './design/design.module.js';
import { ProgressModule } from './progress/progress.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    OllamaModule,
    PromptModule,
    QuestionsModule,
    ApplicationsModule,
    PracticeModule,
    MockModule,
    DesignModule,
    ProgressModule,
  ],
})
export class AppModule {}
