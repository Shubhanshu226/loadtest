import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { LoggerModule } from './logger/logger.module';
import { TestsController } from './tests/tests.controller';
import { TestsService } from './tests/tests.service';

@Module({
  imports: [LoggerModule],
  controllers: [HealthController, TestsController],
  providers: [TestsService],
})
export class AppModule {}

