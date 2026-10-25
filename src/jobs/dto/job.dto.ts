import { IsString, IsOptional, IsArray, IsNumber, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { JobStatus, OfferStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateJobDto {
  @ApiPropertyOptional() @IsString() @IsOptional() categoryId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() subCategoryId?: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsString() occasion: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() eventDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() location?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() guestCount?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() duration?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() budgetMin?: number;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() budgetMax?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() specialRequests?: string;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsOptional() inspirationUrls?: string[];
  @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() publishNow?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPostedToFamily?: boolean;
}

export class UpdateJobDto extends PartialType(CreateJobDto) {
  @ApiPropertyOptional({ enum: JobStatus })
  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;
}

export class CreateOfferDto {
  @ApiProperty() @Type(() => Number) @IsNumber() price: number;
  @ApiPropertyOptional() @IsString() @IsOptional() message?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() coverLetter?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() deliverables?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() estimatedHours?: string;
  @ApiPropertyOptional() @IsOptional() escrowSplitJson?: any;
}

export class JobQueryDto {
  @ApiPropertyOptional() @IsString() @IsOptional() categoryId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() search?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() page?: number = 1;
  @ApiPropertyOptional() @Type(() => Number) @IsNumber() @IsOptional() limit?: number = 10;
  @ApiPropertyOptional() @IsOptional() excludeOffered?: boolean | string;
}
