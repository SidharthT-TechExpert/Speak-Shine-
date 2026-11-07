import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VideosService } from './videos.service';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { SubmitCompleteDto } from './dto/submit-complete.dto';

@ApiTags('Videos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('presigned-url')
  @ApiOperation({
    summary:
      'Generate direct Cloudflare R2 / S3 pre-signed upload URLs for video and frames',
  })
  async generatePresignedUrls(
    @CurrentUser('userId') userId: string,
    @Body() dto: PresignedUrlDto,
  ) {
    return this.videosService.generatePresignedUrls(userId, dto);
  }

  @Post('submit-complete')
  @ApiOperation({
    summary:
      'Notify API of client upload completion and trigger background AI analysis',
  })
  async submitComplete(
    @CurrentUser('userId') userId: string,
    @Body() dto: SubmitCompleteDto,
  ) {
    return this.videosService.submitComplete(userId, dto);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Get AI analysis report for a video submission' })
  async getVideoReport(
    @CurrentUser('userId') userId: string,
    @Param('id') reportId: string,
  ) {
    return this.videosService.getVideoReport(userId, reportId);
  }
}
