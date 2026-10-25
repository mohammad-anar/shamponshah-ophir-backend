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
}
