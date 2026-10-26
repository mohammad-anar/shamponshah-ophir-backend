import { IsString, IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorStatus, VendorTier } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateVendorStatusDto {
  @ApiProperty({ enum: VendorStatus, example: VendorStatus.APPROVED })
  @IsEnum(VendorStatus)
  status: VendorStatus;

  @ApiPropertyOptional({ example: 'Verified identity and credentials' })
  @IsOptional()
  @IsString()
  adminNote?: string;
}

export class UpdateLevelRuleDto {
  @ApiProperty({ enum: VendorTier })
  @IsEnum(VendorTier)
  tier: VendorTier;

  @ApiProperty({ example: 10 })
  @IsNumber()
  minOrders: number;

  @ApiProperty({ example: 4.8 })
  @IsNumber()
  minRating: number;

  @ApiProperty({ example: 95 })
  @IsNumber()
  minResponseRate: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class AdminQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;
}

export class ApproveGigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class RejectGigDto {
  @ApiProperty({ example: 'Misleading pricing tier or insufficient portfolio documentation' })
  @IsString()
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class UpdateGigStatusAdminDto {
  @ApiProperty({ example: 'ACTIVE' })
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class ModerateReportDto {
  @ApiProperty({ enum: ['SUSPEND_GIG', 'DISMISS', 'RESOLVE'], example: 'SUSPEND_GIG' })
  @IsString()
  action: 'SUSPEND_GIG' | 'DISMISS' | 'RESOLVE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotes?: string;
}
