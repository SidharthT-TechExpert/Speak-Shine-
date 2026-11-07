import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@speak-shine/shared-types';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { VideosService } from './videos.service';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { SubmitCompleteDto } from './dto/submit-complete.dto';

@ApiTags('Videos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Roles(Role.STUDENT)
  @Get('my')
  @ApiOperation({ summary: 'List submissions for authenticated student only' })
  async getMySubmissions(@CurrentUser('userId') studentId: string) {
    return this.videosService.getMySubmissions(studentId);
  }

  @Roles(Role.TRAINER)
  @Get('trainer')
  @ApiOperation({ summary: 'List submissions for authenticated trainer classes only' })
  async getTrainerSubmissions(@CurrentUser('userId') trainerId: string) {
    return this.videosService.getTrainerSubmissions(trainerId);
  }

  @Roles(Role.ADMIN)
  @Get('admin/all')
  @ApiOperation({ summary: 'List all submissions across the platform' })
  async getAllSubmissions() {
    return this.videosService.getAllSubmissions();
  }

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
