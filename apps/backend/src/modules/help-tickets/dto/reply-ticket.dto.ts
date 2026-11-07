import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyTicketDto {
  @ApiProperty({ example: 'We have reprocessed your video and updated your score.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2000)
  message: string;
}
