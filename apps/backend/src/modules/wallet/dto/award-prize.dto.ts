import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AwardPrizeDto {
  @ApiProperty({ example: '662b...' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: '662b...' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: '662b...' })
  @IsString()
  @IsOptional()
  taskId?: string;

  @ApiProperty({ example: 100, description: 'Prize amount in INR' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '1st place in Weekly Fluency Challenge' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  reason: string;
}
