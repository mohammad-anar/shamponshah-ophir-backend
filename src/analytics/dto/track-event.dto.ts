import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum TrackingEventType {
  IMPRESSION = 'IMPRESSION',
  CLICK = 'CLICK',
  VIEW = 'VIEW',
}

export enum TrackingEntityType {
  GIG = 'GIG',
  VENDOR = 'VENDOR',
}

export class TrackEventItemDto {
  @IsEnum(TrackingEventType)
  type: TrackingEventType;

  @IsEnum(TrackingEntityType)
  entityType: TrackingEntityType;

  @IsString()
  @IsNotEmpty()
  entityId: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class TrackBatchDto {
  @IsString()
  @IsNotEmpty()
  visitorId: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrackEventItemDto)
  events: TrackEventItemDto[];
}

export class VendorAnalyticsQueryDto {
  @IsOptional()
  @IsString()
  range?: string; // '7D' | '30D' | '90D'

  @IsOptional()
  @IsString()
  gigId?: string;
}
