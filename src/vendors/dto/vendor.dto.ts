import { IsString, IsOptional, IsArray, IsBoolean, IsDateString, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class VendorOnboardingDto {
  @ApiProperty({ example: 'Luminary Studios' })
  @IsString()
  businessName: string;

  @ApiProperty({ example: 'Capturing unforgettable moments' })
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiProperty({ example: 'Award-winning wedding and event photographer with 10 years experience.' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiProperty({ example: 'Chicago' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'IL' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ example: '50 miles' })
  @IsOptional()
  @IsString()
  serviceRadius?: string;

  @ApiProperty({ example: 'Within 1 hour' })
  @IsOptional()
  @IsString()
  responseSpeed?: string;

  @ApiPropertyOptional({ type: [String], description: 'Array of Category IDs' })
  @IsOptional()
  @IsArray()
  categoryIds?: string[];

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-2' })
  @IsOptional()
  @IsString()
  heroImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instagram?: string;
}

export class UpdateVendorProfileDto extends PartialType(VendorOnboardingDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  startingPrice?: number;
}

export class ToggleVacationModeDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isVacationMode: boolean;

  @ApiPropertyOptional({ example: '2026-11-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  vacationEndsAt?: string;
}

export class CreateBlockedDateDto {
  @ApiProperty({ example: '2026-12-25T00:00:00.000Z' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Christmas Holiday' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreatePortfolioItemDto {
  @ApiProperty({ example: 'https://images.unsplash.com/photo-example' })
  @IsString()
  url: string;

  @ApiPropertyOptional({ example: 'image' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Garden Wedding Ceremony' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class VendorQueryDto {
  @ApiPropertyOptional({ description: 'Category slug or ID' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'City name' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Minimum rating (1-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minRating?: number;

  @ApiPropertyOptional({ description: 'Vendor tier (SPROUT, RISING, PRO, ELITE)' })
  @IsOptional()
  @IsString()
  tier?: string;

  @ApiPropertyOptional({ description: 'Search term for name or bio' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 12;
}
