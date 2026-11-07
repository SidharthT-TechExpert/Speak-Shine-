import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitCompleteDto {
  @ApiProperty({ example: '662b...' })
  @IsString()
  @IsNotEmpty()
  reportId: string;

  @ApiProperty({ example: 45, description: 'Duration of recorded video in seconds' })
  @IsInt()
  @Min(5)
  durationSeconds: number;

  @ApiPropertyOptional({
    example: ['d41d8cd98f00b204e9800998ecf8427e'],
    description: '16 sampled frame perceptual hashes for deduplication',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  frameHashes?: string[];
}
