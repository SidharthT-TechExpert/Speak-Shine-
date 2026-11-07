import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrainerRegisterDto {
  @ApiProperty({ example: 'Dr. Priya Mehta' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'priya.trainer@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+919123456789' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'SecureTrainerPass99' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: '10+ years corporate speech and IELTS trainer' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiProperty({
    example: ['CELTA Certified', 'Corporate Communications Coach'],
  })
  @IsArray()
  @IsString({ each: true })
  qualifications: string[];
}
