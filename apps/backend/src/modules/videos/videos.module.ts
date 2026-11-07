import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { AiAnalysisService } from './ai-analysis.service';

@Module({
  controllers: [VideosController],
  providers: [VideosService, AiAnalysisService],
  exports: [VideosService, AiAnalysisService],
})
export class VideosModule {}
