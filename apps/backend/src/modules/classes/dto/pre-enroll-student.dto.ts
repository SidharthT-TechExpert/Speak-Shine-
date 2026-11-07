import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PreEnrollStudentDto {
  @ApiProperty({ example: 'Kavita Roy' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'kavita@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+919876543211' })
  @IsString()
  @IsOptional()
  phone?: string;
}
