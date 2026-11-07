import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLiveSessionDto {
  @ApiProperty({ example: '662b...' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 'Advanced Fluency & Pronunciation Masterclass' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: '2026-11-15T10:00:00.000Z' })
  @IsString()
  @IsNotEmpty()
  scheduledAt: string;
}
