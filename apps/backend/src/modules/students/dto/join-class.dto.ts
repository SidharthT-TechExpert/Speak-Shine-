import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinClassDto {
  @ApiProperty({ example: 'SHINE-1049' })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(20)
  classCode: string;
}
