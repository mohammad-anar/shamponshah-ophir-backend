import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateOrderDto {
  @ApiPropertyOptional({ description: 'When booking a gig package directly' })
  @IsString() @IsOptional() packageId?: string;

  @ApiPropertyOptional({ description: 'Direct booking vendor profile ID' })
  @IsString() @IsOptional() vendorProfileId?: string;

  @ApiPropertyOptional({ description: 'Custom or negotiated subtotal amount' })
  @IsOptional() subtotal?: any;

  @ApiPropertyOptional({ description: 'When accepting a vendor offer on a job' })
  @IsString() @IsOptional() offerId?: string;

  @ApiPropertyOptional({ description: 'Scheduled date for the service booking' })
  @IsString() @IsOptional() eventDate?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional() deliveryNotes?: string;

  @ApiPropertyOptional({ description: 'Add-ons JSON array' })
  @IsOptional() addonsJson?: any;
}

export class ApproveMilestoneDto {
  @ApiPropertyOptional()
  @IsString() @IsOptional() note?: string;
}

export class DeclineDeliveryDto {
  @ApiProperty()
  @IsString()
  reason: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  milestoneId?: string;
}

export class SubmitMilestoneDto {
  @ApiPropertyOptional()
  @IsString() @IsOptional()
  proofUrl?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional()
  notes?: string;
}

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number) @IsNumber() rating: number;

  @ApiPropertyOptional()
  @IsString() @IsOptional() title?: string;

  @ApiProperty()
  @IsString() comment: string;
}

export class CreateDisputeDto {
  @ApiProperty()
  @IsString()
  reason: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  evidence?: any;
}

export class CancelOrderDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class RespondDisputeDto {
  @ApiProperty()
  @IsString()
  responseText: string;

  @ApiPropertyOptional()
  @IsOptional()
  attachments?: string[];
}

export class OrderQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit?: number = 10;
}

