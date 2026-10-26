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

export class RequestCancellationDto {
  @ApiProperty({ description: 'Reason for cancellation request' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Detailed notes explaining the request' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Array of proof URLs or document links' })
  @IsArray()
  @IsOptional()
  proofUrls?: string[];
}

export class RespondCancellationDto {
  @ApiProperty({ description: 'Accept or reject the cancellation', enum: ['ACCEPT', 'REJECT'] })
  @IsString()
  action: 'ACCEPT' | 'REJECT';

  @ApiPropertyOptional({ description: 'Response note or explanation' })
  @IsString()
  @IsOptional()
  note?: string;
}

export class RequestPartialRefundDto {
  @ApiProperty({ description: 'Requested refund amount in USD' })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Reason for requesting partial refund' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Proof files or links' })
  @IsArray()
  @IsOptional()
  proofUrls?: string[];
}

export class RespondPartialRefundDto {
  @ApiProperty({ description: 'Accept or reject the partial refund', enum: ['ACCEPT', 'REJECT'] })
  @IsString()
  action: 'ACCEPT' | 'REJECT';

  @ApiPropertyOptional({ description: 'Response note or explanation' })
  @IsString()
  @IsOptional()
  note?: string;
}

export class EscalateToAdminDto {
  @ApiProperty({ description: 'Reason for escalating case to Admin' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'Additional context or evidence' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class AdminResolveDisputeDto {
  @ApiProperty({
    description: 'Admin resolution decision',
    enum: ['CANCEL_FULL_REFUND', 'PARTIAL_REFUND', 'REJECT_DISPUTE_RELEASE_VENDOR'],
  })
  @IsString()
  decision: 'CANCEL_FULL_REFUND' | 'PARTIAL_REFUND' | 'REJECT_DISPUTE_RELEASE_VENDOR';

  @ApiPropertyOptional({ description: 'Partial refund amount in USD (if decision is PARTIAL_REFUND)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  partialRefundAmount?: number;

  @ApiProperty({ description: 'Formal resolution explanation and statement' })
  @IsString()
  resolutionNotes: string;

  @ApiPropertyOptional({ description: 'Optional alias for resolution explanation' })
  @IsString()
  @IsOptional()
  resolutionNote?: string;
}

