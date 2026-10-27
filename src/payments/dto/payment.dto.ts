import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatePaymentIntentDto {
  @ApiProperty({ description: 'Order ID to create payment intent for' })
  @IsString() orderId: string;

  @ApiPropertyOptional({ description: 'Stripe payment method ID' })
  @IsString() @IsOptional() paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Idempotency key' })
  @IsString() @IsOptional() idempotencyKey?: string;
}

export class CreateOrderPaymentIntentDto {
  @ApiProperty({ description: 'Order ID to fund via escrow' })
  @IsString()
  orderId: string;

  @ApiPropertyOptional({ description: 'Unique idempotency key for this payment attempt' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class ConfirmOrderPaymentDto {
  @ApiProperty({ description: 'Order ID' })
  @IsString()
  orderId: string;

  @ApiProperty({ description: 'Stripe PaymentIntent ID (pi_xxx)' })
  @IsString()
  paymentIntentId: string;

  @ApiPropertyOptional({ description: 'Unique idempotency key' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class SavePaymentMethodDto {
  @ApiProperty({ description: 'Stripe payment method ID (pm_xxx)' })
  @IsString()
  paymentMethodId: string;

  @ApiPropertyOptional({ example: 'Visa' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: '4242' })
  @IsOptional()
  @IsString()
  last4?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  expMonth?: number;

  @ApiPropertyOptional({ example: 2028 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  expYear?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateVendorPayoutPreferencesDto {
  @ApiPropertyOptional({ example: 'Automatic Daily' })
  @IsOptional()
  @IsString()
  payoutSchedule?: string;

  @ApiPropertyOptional({ example: 'Chase Bank Commercial' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: '•••• •••• •••• 8912' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: '••••• 0210' })
  @IsOptional()
  @IsString()
  routingNumber?: string;

  @ApiPropertyOptional({ example: '•••• •••• •••• 4421 (Visa Debit)' })
  @IsOptional()
  @IsString()
  instantDebitCard?: string;
}

export class CreateDisputeDto {
  @ApiProperty({ description: 'Order ID being disputed' })
  @IsString() orderId: string;

  @ApiProperty()
  @IsString() reason: string;

  @ApiProperty()
  @IsString() description: string;

  @ApiPropertyOptional()
  @Type(() => Number) @IsNumber() @IsOptional() refundAmount?: number;
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: ['RESOLVED_CLIENT', 'RESOLVED_VENDOR'] })
  @IsString() resolution: string;

  @ApiPropertyOptional({ description: 'Vendor refund percentage (0-100)' })
  @Type(() => Number) @IsNumber() @IsOptional() vendorSplitPercent?: number;

  @ApiPropertyOptional()
  @IsString() @IsOptional() adminNote?: string;
}

export class WithdrawEarningsDto {
  @ApiProperty({ description: 'Amount in dollars to withdraw' })
  @Type(() => Number) @IsNumber() amount: number;

  @ApiPropertyOptional({ enum: ['standard', 'instant'] })
  @IsString() @IsOptional() speed?: 'standard' | 'instant';
}

export class PurchaseBidCreditsDto {
  @ApiProperty({ description: 'Number of credits to purchase' })
  @Type(() => Number) @IsNumber() credits: number;

  @ApiProperty({ description: 'Stripe payment method ID' })
  @IsString() paymentMethodId: string;
}

export class PayOrderDto {
  @ApiProperty({ description: 'Order ID to fund via escrow' })
  @IsString()
  orderId: string;

  @ApiPropertyOptional({ description: 'Saved payment method ID (if using saved card)' })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Card number' })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiPropertyOptional({ description: 'Card expiration date (MM/YY)' })
  @IsOptional()
  @IsString()
  cardExpiry?: string;

  @ApiPropertyOptional({ description: 'Card security code (CVC)' })
  @IsOptional()
  @IsString()
  cardCvc?: string;

  @ApiPropertyOptional({ description: 'Cardholder name' })
  @IsOptional()
  @IsString()
  cardholderName?: string;

  @ApiPropertyOptional({ description: 'Save card for future payments' })
  @IsOptional()
  @IsBoolean()
  saveCard?: boolean;
}

