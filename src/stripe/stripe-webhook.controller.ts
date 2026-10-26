import { Controller, Post, Headers, Req, RawBodyRequest, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StripeService } from './stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, TransactionType, PaymentStatus, MilestoneStatus, LedgerStatus, LedgerEntryType } from '@prisma/client';
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

    // ── Idempotency: verify this webhook event was not processed already ──
    const existingEvent = await this.prisma.stripeWebhookEvent.findUnique({
      where: { eventId: event.id },
    });
    if (existingEvent) {
      return { received: true, duplicate: true };
    }

    // Record the webhook event ID to prevent duplicate processing
    await this.prisma.stripeWebhookEvent.create({
      data: {
        eventId: event.id,
        eventType: event.type,
      },
    });

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
    const { orderId, milestoneId, clientId, vendorId, vendorProfileId } = pi.metadata || {};
    if (!orderId) return;

    // ── 1. Order-level escrow payment handling ──────────────
    if (!milestoneId || pi.metadata?.type === 'ORDER_ESCROW') {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });
      if (!order) return;

      if (order.status === OrderStatus.PENDING_PAYMENT) {
        await this.prisma.$transaction(async (tx) => {
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: OrderStatus.ACTIVE,
              paymentStatus: PaymentStatus.VAULT_HELD,
              stripePaymentIntentId: pi.id,
              paidAt: new Date(),
            },
          });

          // Create or update vendor wallet pending balance
          let wallet = await tx.vendorWallet.findUnique({
            where: { vendorProfileId: order.vendorProfileId },
          });
          if (!wallet) {
            wallet = await tx.vendorWallet.create({
              data: { vendorProfileId: order.vendorProfileId },
            });
          }

          const netAmount = Number(order.vendorNet || order.grandTotal.mul(0.85));
          await tx.vendorWallet.update({
            where: { id: wallet.id },
            data: {
              pendingAmount: { increment: netAmount },
            },
          });

          // Create wallet ledger entry
          await tx.walletLedgerEntry.create({
            data: {
              walletId: wallet.id,
              vendorProfileId: order.vendorProfileId,
              orderId: order.id,
              type: LedgerEntryType.ORDER_PAYMENT,
              gross: order.amount || order.grandTotal,
              platformFee: order.platformFee,
              vendorNet: order.vendorNet,
              status: LedgerStatus.PENDING,
              description: `Payment for Order #${order.orderNumber} placed in escrow vault`,
            },
          });

          // Transaction record
          await tx.transaction.upsert({
            where: { txRef: `ESCROW-ORDER-${pi.id}` },
            create: {
              txRef: `ESCROW-ORDER-${pi.id}`,
              orderId,
              clientProfileId: order.clientProfileId,
              vendorProfileId: order.vendorProfileId,
              type: TransactionType.ESCROW_DEPOSIT,
              amount: order.amount || order.grandTotal,
              fee: order.platformFee,
              net: order.vendorNet,
              status: PaymentStatus.SUCCEEDED,
              stripeId: pi.id,
              description: `Escrow hold for Order #${order.orderNumber}`,
            },
            update: { status: PaymentStatus.SUCCEEDED },
          });
        });
      }
      return;
    }

    // ── 2. Milestone-level escrow handling ──────────────────
    if (!clientId || (!vendorId && !vendorProfileId)) return;
    const vId = vendorId || vendorProfileId;

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
