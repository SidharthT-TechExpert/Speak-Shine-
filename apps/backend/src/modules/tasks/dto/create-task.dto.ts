import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskType } from '@speak-shine/shared-types';

export class CreateTaskDto {
  @ApiProperty({ example: '662b...' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({ example: 'Describe Your Morning Routine' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiProperty({
    example:
      'Speak about your daily morning habits for 60 seconds. Use active voice and maintain direct eye contact.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description: string;

  @ApiProperty({ enum: TaskType, example: TaskType.DAILY })
  @IsEnum(TaskType)
  type: TaskType;

  @ApiPropertyOptional({
    example: ['articulate', 'meticulous', 'serenity', 'endeavor', 'resilience'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  vocabularyChallengeWords?: string[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/images/park.jpg' })
  @IsString()
  @IsOptional()
  referenceImageUrl?: string;

  @ApiPropertyOptional({ example: 'Once upon a stormy night...' })
  @IsString()
  @IsOptional()
  storyPrompt?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsInt()
  @Min(15)
  @Max(300)
  @IsOptional()
  minDurationSeconds?: number;

  @ApiPropertyOptional({ default: 120 })
  @IsInt()
  @Min(30)
  @Max(600)
  @IsOptional()
  maxDurationSeconds?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsInt()
  @Min(0)
  @IsOptional()
  prizePool?: number;

  @ApiProperty({ example: '2026-11-15T18:30:00.000Z' })
  @IsString()
  @IsNotEmpty()
  dueDate: string;
}
