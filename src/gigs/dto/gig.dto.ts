import { IsString, IsOptional, IsArray, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { GigStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateGigDto {
  @ApiPropertyOptional() @IsString() @IsOptional() categoryId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() subCategoryId?: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsOptional() tags?: string[];
  @ApiPropertyOptional() @IsOptional() faqs?: any;
  @ApiPropertyOptional() @IsArray() @IsOptional() packages?: any[];
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsOptional() images?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsOptional() gallery?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsOptional() galleryUrls?: string[];
  @ApiPropertyOptional() @IsString() @IsOptional() occasion?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() travelRadius?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() outsideRadiusAllowed?: boolean;
}

export class UpdateGigDto extends PartialType(CreateGigDto) {
  @ApiPropertyOptional({ enum: GigStatus })
  @IsEnum(GigStatus)
  @IsOptional()
  status?: GigStatus;
}

export class CreateGigPackageDto {
  @ApiProperty() @IsString() gigId: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @Type(() => Number) @IsNumber() price: number;
  @ApiPropertyOptional() @IsString() @IsOptional() hours?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() turnaround?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPopular?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsOptional() features?: string[];
  @ApiPropertyOptional() @IsOptional() escrowSplitJson?: any;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() sortOrder?: number;
}

export class GigQueryDto {
  @ApiPropertyOptional() @IsString() @IsOptional() categoryId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() minPrice?: number;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() maxPrice?: number;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() page?: number = 1;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() limit?: number = 12;
}

export class ReportGigDto {
  @ApiProperty({ example: 'Misleading pricing or prohibited service' })
  @IsString()
  reason: string;

  @ApiProperty({ example: 'Details about the policy violation or safety issue...' })
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reporterName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reporterEmail?: string;
}
