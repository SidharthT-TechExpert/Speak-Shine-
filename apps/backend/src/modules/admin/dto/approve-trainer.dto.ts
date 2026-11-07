import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrainerApprovalStatus } from '@speak-shine/shared-types';

export class ApproveTrainerDto {
  @ApiProperty({
    enum: [
      TrainerApprovalStatus.ACTIVE,
      TrainerApprovalStatus.REJECTED,
      TrainerApprovalStatus.SUSPENDED,
    ],
    example: TrainerApprovalStatus.ACTIVE,
  })
  @IsEnum(TrainerApprovalStatus)
  status: TrainerApprovalStatus;

  @ApiPropertyOptional({ example: 'Verified certifications and credentials' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reviewNotes?: string;
}
