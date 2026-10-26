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

  @ApiPropertyOptional({ description: 'Order source: GIG or JOB' })
  @IsString() @IsOptional() source?: 'GIG' | 'JOB';

  @ApiPropertyOptional({ description: 'Explicit total order amount' })
  @IsOptional() amount?: any;

  @ApiPropertyOptional({ description: 'Unique idempotency key for this order creation request' })
  @IsString() @IsOptional() idempotencyKey?: string;
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

export class TransitionOrderDto {
  @ApiProperty({ description: 'Target order status according to the state machine' })
  @IsString()
  status: string;

  @ApiPropertyOptional({ description: 'Optional explanation or notes for the transition' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class RequestRevisionDto {
  @ApiProperty({ description: 'Specific feedback and reason for requesting a revision' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Additional notes or requirements' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class DeliverOrderDto {
  @ApiProperty({ description: 'Fulfillment summary and delivery message' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Array of pre-uploaded file URLs' })
  @IsOptional()
  fileUrls?: string[];
}

