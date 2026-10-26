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
  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-example' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-example' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: 'image' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Garden Wedding Ceremony' })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({ example: 'Garden Wedding Ceremony' })
  @IsOptional()
  @IsString()
  title?: string;

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

  @ApiPropertyOptional({ description: 'Minimum rating (e.g. 4.5)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Vendor tier (SPROUT, RISING, PRO, ELITE)' })
  @IsOptional()
  @IsString()
  tier?: string;

  @ApiPropertyOptional({ description: 'Search term for name or bio' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 12 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 12;

  @ApiPropertyOptional({ description: 'Session-based seed for consistent pagination and fair ranking shuffle' })
  @IsOptional()
  @IsString()
  seed?: string;

  @ApiPropertyOptional({ description: 'Sort criteria (recommended, rating, orders, level)' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}

