import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsString()
  @IsNotEmpty()
  identifier: string;
}
