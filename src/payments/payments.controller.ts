import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentIntentDto,
  CreateOrderPaymentIntentDto,
  ConfirmOrderPaymentDto,
  CreateDisputeDto,
  ResolveDisputeDto,
  WithdrawEarningsDto,
  PurchaseBidCreditsDto,
  SavePaymentMethodDto,
  UpdateVendorPayoutPreferencesDto,
  PayOrderDto,
} from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Role } from '@prisma/client';

@ApiTags('Payments & Stripe Connect')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ── Client: Payment Intents & Methods ──────────────────────

  @Post('intent')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Create Stripe PaymentIntent for order escrow deposit (Client)' })
  createPaymentIntent(@Req() req: any, @Body() dto: CreatePaymentIntentDto) {
    return this.paymentsService.createPaymentIntent(req.user.clientProfileId, dto);
  }

  @Post('order-intent')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Create Stripe PaymentIntent for whole order escrow deposit (Client)' })
  createOrderPaymentIntent(@Req() req: any, @Body() dto: CreateOrderPaymentIntentDto) {
    return this.paymentsService.createOrderPaymentIntent(req.user.clientProfileId, dto);
  }

  @Post('confirm-order-payment')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Confirm Stripe PaymentIntent and activate order escrow hold (Client)' })
  confirmOrderPayment(@Req() req: any, @Body() dto: ConfirmOrderPaymentDto) {
    return this.paymentsService.confirmOrderPayment(req.user.clientProfileId, dto);
  }

  @Post('pay-order')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Pay for order and secure escrow hold using card details or saved card (Client)' })
  payOrder(@Req() req: any, @Body() dto: PayOrderDto) {
    return this.paymentsService.payOrder(req.user.clientProfileId, dto);
  }

  @Get('methods')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Get saved payment methods (Client)' })
  getPaymentMethods(@Req() req: any) {
    return this.paymentsService.getPaymentMethods(req.user.clientProfileId);
  }

  @Post('setup-intent')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Create Stripe SetupIntent for saving a card (Client)' })
  createSetupIntent(@Req() req: any) {
    return this.paymentsService.createSetupIntent(req.user.clientProfileId);
  }

  @Post('methods/save')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Save confirmed Stripe payment method to client wallet (Client)' })
  savePaymentMethod(@Req() req: any, @Body() dto: SavePaymentMethodDto) {
    return this.paymentsService.savePaymentMethod(req.user.clientProfileId, dto);
  }

  @Patch('methods/:id/default')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Set payment method as default (Client)' })
  setDefaultPaymentMethod(@Req() req: any, @Param('id') id: string) {
    return this.paymentsService.setDefaultPaymentMethod(req.user.clientProfileId, id);
  }

  @Post('methods')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Attach a new payment method (Client)' })
  addPaymentMethod(@Req() req: any, @Body('paymentMethodId') pmId: string) {
    return this.paymentsService.addPaymentMethod(req.user.clientProfileId, pmId);
  }

  @Delete('methods/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Remove a payment method (Client)' })
  removePaymentMethod(@Req() req: any, @Param('id') id: string) {
    return this.paymentsService.removePaymentMethod(id, req.user.clientProfileId);
  }

  // ── Disputes ───────────────────────────────────────────────

  @Post('disputes')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Open an escrow dispute on an order (Client)' })
  createDispute(@Req() req: any, @Body() dto: CreateDisputeDto) {
    return this.paymentsService.createDispute(req.user.clientProfileId, dto);
  }

  @Get('disputes/client')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Get client disputes (Client)' })
  getClientDisputes(@Req() req: any) {
    return this.paymentsService.getClientDisputes(req.user.clientProfileId);
  }

  @Get('disputes/vendor')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get vendor disputes (Vendor)' })
  getVendorDisputes(@Req() req: any) {
    return this.paymentsService.getVendorDisputes(req.user.vendorProfileId);
  }

  @Patch('disputes/:id/resolve')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Resolve dispute and execute Stripe settlement / refund (Admin)' })
  resolveDispute(@Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.paymentsService.resolveDispute(id, dto);
  }

  // ── Vendor: Earnings & Withdrawals ─────────────────────────

  @Get('vendor/earnings')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get vendor earnings, available/pending/escrow balances (Vendor)' })
  getVendorEarnings(@Req() req: any) {
    return this.paymentsService.getVendorEarnings(req.user.vendorProfileId);
  }

  @Get('vendor/wallet')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get vendor wallet: Pending, Pending for release, Available balances, and ledger (Vendor)' })
  getVendorWallet(@Req() req: any) {
    return this.paymentsService.getVendorWallet(req.user.vendorProfileId);
  }

  @Post('vendor/withdraw')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Initiate payout withdrawal to bank via Stripe (Vendor)' })
  withdrawEarnings(@Req() req: any, @Body() dto: WithdrawEarningsDto) {
    return this.paymentsService.withdrawEarnings(req.user.vendorProfileId, dto);
  }

  // ── Vendor: Bid Credits ────────────────────────────────────

  @Public()
  @Get('bid-credit-packages')
  @ApiOperation({ summary: 'Get active bid credit packages for purchasing (Public / Authenticated)' })
  getBidCreditPackages() {
    return this.paymentsService.getBidCreditPackages();
  }

  @Get('vendor/bid-credits')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get vendor bid credit balance (Vendor)' })
  getBidCredits(@Req() req: any) {
    return this.paymentsService.getBidCreditBalance(req.user.vendorProfileId);
  }

  @Post('vendor/bid-credits')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Purchase bid credits pack via Stripe (Vendor)' })
  purchaseBidCredits(@Req() req: any, @Body() dto: PurchaseBidCreditsDto) {
    return this.paymentsService.purchaseBidCredits(req.user.vendorProfileId, dto);
  }

  // ── Vendor: Stripe Connect ─────────────────────────────────

  @Post('vendor/connect/stripe')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Generate Stripe Connect Express onboarding link (Vendor)' })
  connectStripe(@Req() req: any) {
    return this.paymentsService.connectStripe(req.user.vendorProfileId, req.user.email);
  }

  @Get('vendor/connect/stripe/status')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get Stripe Connect account status and payout readiness (Vendor)' })
  getStripeStatus(@Req() req: any) {
    return this.paymentsService.getStripeConnectStatus(req.user.vendorProfileId);
  }

  @Get('vendor/connect/stripe/portal')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Generate Stripe Express Dashboard login link (Vendor)' })
  getStripePortal(@Req() req: any) {
    return this.paymentsService.getStripePortalLink(req.user.vendorProfileId);
  }

  @Patch('vendor/payout-settings')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Save vendor payout schedule and bank account preferences (Vendor)' })
  updatePayoutPreferences(@Req() req: any, @Body() dto: UpdateVendorPayoutPreferencesDto) {
    return this.paymentsService.updateVendorPayoutPreferences(req.user.vendorProfileId, dto);
  }
}
