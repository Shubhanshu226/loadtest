import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TestsService } from './tests.service';

@Controller('/api/tests')
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  // 🔥 CREATE TEST
  @Post()
  @UseInterceptors(
    FileInterceptor('collection', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    }),
  )
  async create(
    @UploadedFile() file?: Express.Multer.File,
    @Query('vus') vusQuery?: string,
    @Query('duration') durationQuery?: string,
    @Body() body?: any,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing file "collection"');
    }

    let json: any;
    try {
      json = JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON');
    }

    // ✅ Validate VUs
    const vus = Number(vusQuery ?? 100);
    if (isNaN(vus) || vus <= 0 || vus > 5000) {
      throw new BadRequestException('vus must be between 1 and 5000');
    }

    // ✅ Validate duration
    const duration = durationQuery ?? '30s';
    if (!/^\d+(s|m)$/.test(duration)) {
      throw new BadRequestException('duration must be like 30s or 5m');
    }

    const collectionName = json?.info?.name;

    let config: any = undefined;
    if (body?.config) {
      try {
        config = typeof body.config === 'string' ? JSON.parse(body.config) : body.config;
      } catch {
        throw new BadRequestException('config must be valid JSON');
      }
    }

    const testId = await this.tests.createTest(json, {
      vus,
      duration,
      collectionName,
      config,
    });

    return { testId };
  }

  // 🔥 RUN TEST (ASYNC)
  @Post(':id/run')
  async run(@Param('id') id: string) {
    const test = await this.safeGet(id);

    if (test.status === 'running') {
      throw new BadRequestException('Test already running');
    }

    // For MVP: run and return results in the same response
    await this.tests.runTest(id);
    return await this.safeGet(id);
  }

  // 🔥 GET TEST STATUS
  @Get(':id')
  async get(@Param('id') id: string) {
    return await this.safeGet(id);
  }

  // 🔥 INTERNAL SAFE GET
  private async safeGet(id: string) {
    try {
      return await this.tests.getTest(id);
    } catch {
      throw new NotFoundException('Test not found');
    }
  }
}