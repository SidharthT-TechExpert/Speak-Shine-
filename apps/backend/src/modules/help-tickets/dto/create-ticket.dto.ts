import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority } from '@speak-shine/shared-types';

export class CreateTicketDto {
  @ApiProperty({ example: 'Video analysis failed on submission' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(150)
  subject: string;

  @ApiProperty({ example: 'VIDEO_ANALYSIS', enum: ['PAYMENT', 'VIDEO_ANALYSIS', 'CLASS_ACCESS', 'BUG', 'OTHER'] })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ enum: TicketPriority, default: TicketPriority.MEDIUM })
  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority;

  @ApiProperty({ example: 'My video was uploaded but the score breakdown shows error.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(2000)
  message: string;
}
