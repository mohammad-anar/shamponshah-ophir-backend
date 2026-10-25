import { Controller, Post, Headers, Req, RawBodyRequest, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, TransactionType, PaymentStatus, MilestoneStatus } from '@prisma/client';
import { Request } from 'express';

@ApiTags('Stripe Webhooks')
@Controller('stripe')
export class StripeWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Stripe webhooks' })
  async handleWebhook(
    @Req() req: any,
    @Headers('stripe-signature') sig: string,
  ) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') as string;
    const event = this.stripeService.constructWebhookEvent(req.rawBody!, sig, secret);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentIntentSucceeded(event.data.object as any);
        break;

      case 'payment_intent.payment_failed':
        await this.onPaymentIntentFailed(event.data.object as any);
        break;

      case 'account.updated':
        await this.onAccountUpdated(event.data.object as any);
        break;

      case 'payout.paid':
        await this.onPayoutPaid(event.data.object as any);
        break;

      case 'payout.failed':
        await this.onPayoutFailed(event.data.object as any);
        break;

      default:
        console.log(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }

  private async onPaymentIntentSucceeded(pi: any) {
    const { orderId, milestoneId, clientId, vendorId } = pi.metadata || {};
    if (!orderId || !milestoneId || !clientId || !vendorId) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { milestones: true },
    });
    const milestone = order?.milestones.find((item) => item.id === milestoneId);
    if (!order || !milestone || order.clientProfileId !== clientId || order.vendorProfileId !== vendorId) return;
    if (pi.currency !== 'usd' || pi.amount < Math.round(Number(milestone.amount) * 100)) return;

    if (order.status === OrderStatus.CANCELLED) {
      const refund = await this.stripeService.createRefund({
        paymentIntentId: pi.id,
        idempotencyKey: `cancel-${order.id}-${milestone.id}`,
      });
      await this.prisma.$transaction(async (tx) => {
        await tx.milestone.update({
          where: { id: milestone.id },
          data: { status: MilestoneStatus.REFUNDED, note: `Late payment refunded after cancellation (${refund.id}).` },
        });
        await tx.transaction.upsert({
          where: { txRef: `REFUND-${refund.id}` },
          create: {
            txRef: `REFUND-${refund.id}`,
            orderId,
            clientProfileId: clientId,
            vendorProfileId: vendorId,
            type: TransactionType.REFUND,
            amount: refund.amount / 100,
            fee: 0,
            net: refund.amount / 100,
            status: PaymentStatus.SUCCEEDED,
            stripeId: refund.id,
            description: `Late cancellation refund: ${milestone.label}`,
            metadata: { milestoneId },
          },
          update: { status: PaymentStatus.SUCCEEDED },
        });
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.milestone.updateMany({
        where: { id: milestoneId, orderId, status: MilestoneStatus.LOCKED },
        data: { status: MilestoneStatus.FUNDED, stripePaymentIntentId: pi.id },
      });
      await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.ACTIVE, stripePaymentIntentId: pi.id },
      });
      await tx.transaction.upsert({
        where: { txRef: `ESCROW-${pi.id}` },
        create: {
          txRef: `ESCROW-${pi.id}`,
          orderId,
          clientProfileId: clientId,
          vendorProfileId: vendorId,
          type: TransactionType.ESCROW_DEPOSIT,
          amount: pi.amount / 100,
          fee: pi.amount / 100 - Number(milestone.amount),
          net: Number(milestone.amount),
          status: PaymentStatus.SUCCEEDED,
          stripeId: pi.id,
          description: `Milestone funded: ${milestone.label}`,
          metadata: { milestoneId },
        },
        update: { status: PaymentStatus.SUCCEEDED },
      });
      await tx.earning.upsert({
        where: { milestoneId },
        create: {
          vendorProfileId: vendorId,
          orderId,
          milestoneId,
          amount: milestone.amount,
          status: 'in_escrow',
        },
        update: {},
      });
    });
  }

  private async onPaymentIntentFailed(pi: any) {
    const { orderId, milestoneId, clientId, vendorId } = pi.metadata || {};
    if (!orderId || !milestoneId) return;
    await this.prisma.transaction.upsert({
      where: { txRef: `PAYFAIL-${pi.id}` },
      create: {
        txRef: `PAYFAIL-${pi.id}`,
        orderId,
        clientProfileId: clientId,
        vendorProfileId: vendorId,
        type: TransactionType.ESCROW_DEPOSIT,
        amount: pi.amount / 100,
        fee: 0,
        net: 0,
        status: PaymentStatus.FAILED,
        stripeId: pi.id,
        description: `Milestone payment failed: ${milestoneId}`,
        metadata: { milestoneId },
      },
      update: { status: PaymentStatus.FAILED },
    });
  }

  private async onAccountUpdated(account: any) {
    const vendor = await this.prisma.vendorProfile.findFirst({
      where: { stripeAccountId: account.id },
    });
    if (!vendor) return;

    await this.prisma.vendorProfile.update({
      where: { id: vendor.id },
      data: {
        payoutsEnabled: account.payouts_enabled,
        stripeAccountStatus: account.details_submitted ? 'complete' : 'pending',
      },
    });
  }

  private async onPayoutPaid(payout: any) {
    await this.prisma.transaction.updateMany({
      where: { stripeId: payout.id, type: TransactionType.PAYOUT },
      data: { status: PaymentStatus.SUCCEEDED },
    });
  }

  private async onPayoutFailed(payout: any) {
    await this.prisma.transaction.updateMany({
      where: { stripeId: payout.id, type: TransactionType.PAYOUT },
      data: { status: PaymentStatus.FAILED },
    });
  }
}
