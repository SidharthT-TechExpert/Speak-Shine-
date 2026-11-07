import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClassDto {
  @ApiProperty({ example: 'Fluency Cohort November' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({ example: 'Daily speech challenges and live sessions' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
