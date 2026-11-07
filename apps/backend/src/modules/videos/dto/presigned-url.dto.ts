import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PresignedUrlDto {
  @ApiProperty({ example: 'speech_submission.mp4' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiPropertyOptional({ example: '662b...' })
  @IsString()
  @IsOptional()
  taskId?: string;

  @ApiProperty({ example: 16, description: 'Number of sampled video frames' })
  @IsInt()
  @Min(0)
  @Max(30)
  frameCount: number;
}
