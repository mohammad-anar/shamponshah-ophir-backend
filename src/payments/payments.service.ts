import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { ConfigService } from '@nestjs/config';
import {
  CreatePaymentIntentDto,
  CreateDisputeDto,
  ResolveDisputeDto,
  WithdrawEarningsDto,
  PurchaseBidCreditsDto,
  SavePaymentMethodDto,
  UpdateVendorPayoutPreferencesDto,
} from './dto/payment.dto';
import { DisputeStatus, TransactionType, PaymentStatus, MilestoneStatus, OrderStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
  ) {}

  // Ã¢â€â‚¬Ã¢â€â‚¬ Create Payment Intent Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async createPaymentIntent(clientProfileId: string, dto: CreatePaymentIntentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { clientProfile: true, vendorProfile: true, milestones: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.clientProfileId !== clientProfileId) throw new ForbiddenException('You cannot pay for this order');
    if (([OrderStatus.CANCELLED, OrderStatus.DISPUTED, OrderStatus.COMPLETED] as OrderStatus[]).includes(order.status)) {
      throw new BadRequestException('This order cannot accept another milestone payment');
    }

    const milestone = order.milestones.find((item) => item.status === MilestoneStatus.LOCKED);
    if (!milestone) throw new BadRequestException('There is no unpaid milestone to fund');
    if (!order.vendorProfile.stripeAccountId || !order.vendorProfile.payoutsEnabled) {
      throw new BadRequestException('Vendor must finish Stripe Connect onboarding before this order can be paid');
    }
    const connectStatus = await this.stripe.getAccountStatus(order.vendorProfile.stripeAccountId);
    if (!connectStatus.transfersEnabled || !connectStatus.payoutsEnabled) {
      throw new BadRequestException('Vendor Stripe account is not ready to receive transfers');
    }

    const paymentMethod = dto.paymentMethodId
      ? await this.prisma.paymentMethod.findFirst({
          where: { clientProfileId, stripePaymentMethodId: dto.paymentMethodId },
        })
      : await this.prisma.paymentMethod.findFirst({
          where: { clientProfileId, isDefault: true },
        });
    if (!paymentMethod) throw new BadRequestException('Add a valid payment method before placing this order');

    const orderedMilestones = order.milestones;
    const milestoneIndex = orderedMilestones.findIndex((item) => item.id === milestone.id);
    const totalFeeCents = Math.round(Number(order.platformFee) * 100);
    const subtotalCents = Math.round(Number(order.subtotal) * 100);
    let allocatedFeeCents = 0;
    for (let index = 0; index < milestoneIndex; index += 1) {
      allocatedFeeCents += Math.round(
        (totalFeeCents * Math.round(Number(orderedMilestones[index].amount) * 100)) / subtotalCents,
      );
    }
    const feeCents = milestoneIndex === orderedMilestones.length - 1
      ? totalFeeCents - allocatedFeeCents
      : Math.round((totalFeeCents * Math.round(Number(milestone.amount) * 100)) / subtotalCents);
    const chargeAmount = Number(milestone.amount) + feeCents / 100;

    let pi: any;
    if (milestone.stripePaymentIntentId) {
      pi = await this.stripe.retrievePaymentIntent(milestone.stripePaymentIntentId);
      if (pi.status === 'succeeded') {
        return { clientSecret: pi.client_secret, paymentIntentId: pi.id, milestoneId: milestone.id, amount: chargeAmount, paymentStatus: pi.status };
      }
      if (pi.status === 'requires_payment_method') {
        pi = await this.stripe.confirmPaymentIntent(pi.id, paymentMethod.stripePaymentMethodId);
      }
    } else {
      pi = await this.stripe.createPaymentIntent({
        amount: chargeAmount,
        orderId: order.id,
        milestoneId: milestone.id,
        clientId: clientProfileId,
        vendorId: order.vendorProfileId,
        customerId: order.clientProfile.stripeCustomerId || undefined,
        paymentMethodId: paymentMethod.stripePaymentMethodId,
        idempotencyKey: `order-${order.id}-milestone-${milestone.id}`,
      });
      await this.prisma.milestone.update({
        where: { id: milestone.id },
        data: { stripePaymentIntentId: pi.id },
      });
    }

    return { clientSecret: pi.client_secret, paymentIntentId: pi.id, milestoneId: milestone.id, amount: chargeAmount, paymentStatus: pi.status };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Payment Methods Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async createSetupIntent(clientProfileId: string) {
    const client = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: { user: true },
    });
    if (!client) throw new NotFoundException('Client profile not found');

    let customerId = client.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.createCustomer(client.user.email, client.displayName);
      customerId = customer.id;
      await this.prisma.clientProfile.update({ where: { id: client.id }, data: { stripeCustomerId: customerId } });
    }
    const setupIntent = await this.stripe.createSetupIntent(customerId);
    return { clientSecret: setupIntent.client_secret, customerId };
  }

  async getPaymentMethods(clientProfileId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { clientProfileId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async savePaymentMethod(clientProfileId: string, dto: SavePaymentMethodDto) {
    const client = await this.prisma.clientProfile.findUnique({ where: { id: clientProfileId } });
    if (!client?.stripeCustomerId) throw new BadRequestException('Set up a payment method through Stripe first');
    const details = await this.stripe.getPaymentMethodDetails(dto.paymentMethodId);
    const stripeCustomerId = typeof details.customer === 'string' ? details.customer : details.customer?.id;
    if (stripeCustomerId !== client.stripeCustomerId || !details.card) {
      throw new ForbiddenException('Payment method does not belong to this client');
    }
    const brand = details.card.brand;
    const last4 = details.card.last4;
    const expMonth = details.card.exp_month;
    const expYear = details.card.exp_year;

    if (dto.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { clientProfileId },
        data: { isDefault: false },
      });
    }

    const existing = await this.prisma.paymentMethod.findUnique({
      where: { stripePaymentMethodId: dto.paymentMethodId },
    });

    if (existing) {
      return this.prisma.paymentMethod.update({
        where: { id: existing.id },
        data: {
          brand,
          last4,
          expMonth,
          expYear,
          isDefault: dto.isDefault ?? true,
        },
      });
    }

    return this.prisma.paymentMethod.create({
      data: {
        clientProfileId,
        stripePaymentMethodId: dto.paymentMethodId,
        type: 'card',
        brand,
        last4,
        expMonth,
        expYear,
        isDefault: dto.isDefault ?? true,
      },
    });
  }

  async setDefaultPaymentMethod(clientProfileId: string, pmId: string) {
    const pm = await this.prisma.paymentMethod.findFirst({ where: { id: pmId, clientProfileId } });
    if (!pm) throw new NotFoundException('Payment method not found');

    await this.prisma.paymentMethod.updateMany({
      where: { clientProfileId },
      data: { isDefault: false },
    });

    return this.prisma.paymentMethod.update({
      where: { id: pmId },
      data: { isDefault: true },
    });
  }

  async addPaymentMethod(clientProfileId: string, stripePaymentMethodId: string) {
    return this.savePaymentMethod(clientProfileId, { paymentMethodId: stripePaymentMethodId });
  }

  async removePaymentMethod(pmId: string, clientProfileId: string) {
    const pm = await this.prisma.paymentMethod.findFirst({ where: { id: pmId, clientProfileId } });
    if (!pm) throw new NotFoundException('Payment method not found');

    try {
      await this.stripe.detachPaymentMethod(pm.stripePaymentMethodId);
    } catch (_) {}

    await this.prisma.paymentMethod.delete({ where: { id: pmId } });
    return { message: 'Payment method removed' };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Disputes Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async createDispute(clientProfileId: string, dto: CreateDisputeDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.clientProfileId !== clientProfileId) throw new BadRequestException('Unauthorized');

    const dispute = await this.prisma.dispute.create({
      data: {
        orderId: dto.orderId,
        clientProfileId,
        vendorProfileId: order.vendorProfileId,
        reason: dto.reason,
        description: dto.description,
        status: DisputeStatus.OPEN,
      },
    });
    await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.DISPUTED } });
    return dispute;
  }

  async getClientDisputes(clientProfileId: string) {
    return this.prisma.dispute.findMany({
      where: { clientProfileId },
      include: {
        order: { select: { orderNumber: true, grandTotal: true } },
        vendorProfile: { select: { businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVendorDisputes(vendorProfileId: string) {
    return this.prisma.dispute.findMany({
      where: { vendorProfileId },
      include: {
        order: { select: { orderNumber: true, grandTotal: true } },
        clientProfile: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Admin: Resolve Dispute with Stripe escrow settlement Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async resolveDispute(disputeId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: { include: { vendorProfile: true, milestones: true } },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    const { order } = dispute;
    if (!['RESOLVED_CLIENT', 'RESOLVED_VENDOR'].includes(dto.resolution)) {
      throw new BadRequestException('Invalid dispute resolution');
    }
    if (!([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] as DisputeStatus[]).includes(dispute.status)) {
      throw new BadRequestException('This dispute has already been resolved');
    }
    const vendorPercent = dto.resolution === 'RESOLVED_VENDOR'
      ? (dto.vendorSplitPercent ?? 100)
      : 0;
    if (vendorPercent < 0 || vendorPercent > 100) throw new BadRequestException('Vendor split must be between 0 and 100');
    if (vendorPercent > 0 && !order.vendorProfile.stripeAccountId) {
      throw new BadRequestException('Vendor has no Stripe Connect account');
    }

    const settled: any[] = [];
    for (const milestone of order.milestones) {
      if (!milestone.stripePaymentIntentId || ([MilestoneStatus.LOCKED, MilestoneStatus.REFUNDED] as MilestoneStatus[]).includes(milestone.status)) continue;
      const paymentIntent = await this.stripe.retrievePaymentIntent(milestone.stripePaymentIntentId);
      if (paymentIntent.status !== 'succeeded') continue;

      const originalAmount = Number(milestone.amount);
      const vendorAmount = Math.round(originalAmount * vendorPercent) / 100;
      let transferId = milestone.stripeTransferId;
      if (milestone.stripeTransferId) {
        const reversalAmount = Math.round((originalAmount - vendorAmount) * 100) / 100;
        if (dto.resolution === 'RESOLVED_CLIENT' || reversalAmount > 0) {
          await this.stripe.reverseTransfer(
            milestone.stripeTransferId,
            dto.resolution === 'RESOLVED_CLIENT' ? undefined : reversalAmount,
            `dispute-${disputeId}-reverse-${milestone.id}`,
          );
        }
      } else if (vendorAmount > 0) {
        const transfer = await this.stripe.transferMilestone({
          amount: vendorAmount,
          vendorStripeAccountId: order.vendorProfile.stripeAccountId!,
          orderId: order.id,
          milestoneId: milestone.id,
          paymentIntentId: milestone.stripePaymentIntentId,
          idempotencyKey: `dispute-${disputeId}-transfer-${milestone.id}`,
        });
        transferId = transfer.id;
      }

      const refundAmount = dto.resolution === 'RESOLVED_CLIENT'
        ? paymentIntent.amount / 100
        : Math.max(0, paymentIntent.amount / 100 - vendorAmount);
      const refund = refundAmount > 0
        ? await this.stripe.createRefund({
            paymentIntentId: milestone.stripePaymentIntentId,
            amount: refundAmount,
            idempotencyKey: `dispute-${disputeId}-refund-${milestone.id}`,
          })
        : null;

      await this.prisma.$transaction(async (tx) => {
        await tx.milestone.update({
          where: { id: milestone.id },
          data: {
            status: vendorAmount > 0 ? MilestoneStatus.RELEASED : MilestoneStatus.REFUNDED,
            releasedAt: vendorAmount > 0 ? new Date() : milestone.releasedAt,
            stripeTransferId: transferId,
            note: `Admin dispute resolution: ${dto.resolution}`,
          },
        });
        if (vendorAmount > 0 && transferId) {
          await tx.earning.upsert({
            where: { milestoneId: milestone.id },
            create: {
              vendorProfileId: order.vendorProfileId,
              orderId: order.id,
              milestoneId: milestone.id,
              amount: vendorAmount,
              status: 'available',
              stripeTransferId: transferId,
            },
            update: { amount: vendorAmount, status: 'available', stripeTransferId: transferId },
          });
          await tx.transaction.upsert({
            where: { txRef: `TRANSFER-${transferId}` },
            create: {
              txRef: `TRANSFER-${transferId}`,
              orderId: order.id,
              vendorProfileId: order.vendorProfileId,
              clientProfileId: order.clientProfileId,
              type: TransactionType.MILESTONE_RELEASE,
              amount: vendorAmount,
              fee: 0,
              net: vendorAmount,
              status: PaymentStatus.SUCCEEDED,
              stripeId: transferId,
              description: `Dispute settlement transfer: ${milestone.label}`,
              metadata: { milestoneId: milestone.id, disputeId },
            },
            update: { amount: vendorAmount, net: vendorAmount, status: PaymentStatus.SUCCEEDED },
          });
        } else {
          await tx.earning.updateMany({ where: { milestoneId: milestone.id }, data: { status: 'refunded' } });
        }
        if (refund) {
          await tx.transaction.upsert({
            where: { txRef: `REFUND-${refund.id}` },
            create: {
              txRef: `REFUND-${refund.id}`,
              orderId: order.id,
              vendorProfileId: order.vendorProfileId,
              clientProfileId: order.clientProfileId,
              type: TransactionType.REFUND,
              amount: refundAmount,
              fee: 0,
              net: refundAmount,
              status: PaymentStatus.SUCCEEDED,
              stripeId: refund.id,
              description: `Dispute refund: ${milestone.label}`,
              metadata: { milestoneId: milestone.id },
            },
            update: { status: PaymentStatus.SUCCEEDED },
          });
        }
      });
      settled.push({ milestoneId: milestone.id, refundId: refund?.id, vendorAmount });
    }

    await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { id: disputeId },
        data: { status: dto.resolution as DisputeStatus, resolution: dto.adminNote, resolvedAt: new Date() },
      }),
      this.prisma.order.update({
        where: { id: order.id },
        data: { status: dto.resolution === 'RESOLVED_VENDOR' ? OrderStatus.COMPLETED : OrderStatus.CANCELLED },
      }),
    ]);
    return { message: 'Dispute resolved', settlements: settled };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Vendor: Earnings & Withdrawals Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async getVendorEarnings(vendorProfileId: string) {
    const [vendor, earnings, transferred, pending, escrow, payouts, upcomingReleases] = await Promise.all([
      this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId }, select: { stripeAccountId: true } }),
      this.prisma.earning.findMany({
        where: { vendorProfileId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.earning.aggregate({
        where: { vendorProfileId, status: 'available' },
        _sum: { amount: true },
      }),
      this.prisma.earning.aggregate({
        where: { vendorProfileId, status: 'pending' },
        _sum: { amount: true },
      }),
      this.prisma.earning.aggregate({
        where: { vendorProfileId, status: { in: ['locked', 'in_escrow'] } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.findMany({
        where: { vendorProfileId, type: TransactionType.PAYOUT },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.milestone.findMany({
        where: {
          status: { in: [MilestoneStatus.PENDING_RELEASE, MilestoneStatus.APPROVED_PENDING_RELEASE] },
          order: { vendorProfileId },
        },
        include: { order: { select: { orderNumber: true } } },
        orderBy: { releaseAt: 'asc' },
      }),
    ]);

    let connectedBalance = { available: Number(transferred._sum.amount || 0), pending: 0 };
    if (vendor?.stripeAccountId) {
      try {
        const stripeBal = await this.stripe.getConnectedBalance(vendor.stripeAccountId);
        if (stripeBal) connectedBalance = stripeBal;
      } catch {
        connectedBalance = { available: Number(transferred._sum.amount || 0), pending: 0 };
      }
    }
    const relatedOrders = await this.prisma.order.findMany({
      where: { id: { in: earnings.map((earning) => earning.orderId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, orderNumber: true },
    });
    const orderNumbers = new Map(relatedOrders.map((item) => [item.id, item.orderNumber]));
    const transferredAmount = Number(transferred._sum.amount || 0);
    const totalEarned = transferredAmount + Number(pending._sum.amount || 0) + Number(escrow._sum.amount || 0);

    return {
      earnings: earnings.map((earning) => ({ ...earning, orderNumber: earning.orderId ? orderNumbers.get(earning.orderId) : undefined })),
      upcomingReleases: upcomingReleases.map((milestone) => ({
        milestoneId: milestone.id,
        orderNumber: milestone.order.orderNumber,
        label: milestone.label,
        amount: Number(milestone.amount),
        approvedAt: milestone.approvedAt,
        releaseAt: milestone.releaseAt,
      })),
      availableBalance: connectedBalance.available,
      transferredBalance: transferredAmount,
      stripePendingBalance: connectedBalance.pending,
      pendingBalance: Number(pending._sum.amount || 0),
      escrowBalance: Number(escrow._sum.amount || 0),
      totalEarned,
      payoutHistory: payouts.length > 0 ? payouts.map((p) => ({
        id: p.txRef,
        date: p.createdAt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        amount: `$${Number(p.amount).toFixed(2)}`,
        destination: 'Stripe Connect payout',
        type: p.description?.toLowerCase().includes('instant') ? 'Instant payout' : 'Standard payout',
        status: p.status,
      })) : [],
    };
  }

  async getBidCreditPackages() {
    return this.prisma.bidCreditPackage.findMany({
      where: { isActive: true },
      orderBy: { credits: 'asc' },
    });
  }

  async withdrawEarnings(vendorProfileId: string, dto: WithdrawEarningsDto) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (!vendor?.stripeAccountId) throw new BadRequestException('Stripe account not connected');
    if (!vendor.payoutsEnabled) throw new BadRequestException('Payouts not enabled yet');
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new BadRequestException('Enter a valid payout amount');
    const connectedBalance = await this.stripe.getConnectedBalance(vendor.stripeAccountId);
    if (dto.amount > connectedBalance.available) {
      throw new BadRequestException(`Only $${connectedBalance.available.toFixed(2)} is available in your Stripe balance`);
    }

    const payout = await this.stripe.createPayout({
      amount: dto.amount,
      stripeAccountId: vendor.stripeAccountId,
      method: dto.speed,
    });

    await this.prisma.transaction.create({
      data: {
        txRef: `PAYOUT-${Date.now()}`,
        vendorProfileId,
        type: TransactionType.PAYOUT,
        amount: dto.amount,
        fee: 0,
        net: dto.amount,
        status: PaymentStatus.PROCESSING,
        stripeId: payout.id,
        description: `${dto.speed || 'standard'} payout`,
      },
    });

    return { message: 'Payout initiated', payoutId: payout.id };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Bid Credits Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async getBidCreditBalance(vendorProfileId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      select: { bidCredits: true },
    });
    return { bidCredits: vendor?.bidCredits || 0 };
  }

  async purchaseBidCredits(vendorProfileId: string, dto: PurchaseBidCreditsDto) {
    const packages: Record<number, number> = { 10: 15, 25: 30, 60: 60 };
    const price = packages[dto.credits];
    if (!price) throw new BadRequestException('Invalid credit package');

    await this.stripe.chargeBidCredits({
      amount: price,
      paymentMethodId: dto.paymentMethodId,
      description: `${dto.credits} Bid Credits purchase`,
    });

    const [vendor] = await Promise.all([
      this.prisma.vendorProfile.update({
        where: { id: vendorProfileId },
        data: { bidCredits: { increment: dto.credits } },
        select: { bidCredits: true },
      }),
      this.prisma.bidCreditTransaction.create({
        data: {
          vendorProfileId,
          credits: dto.credits,
          type: 'PURCHASE',
          description: `Purchased ${dto.credits} bid credits`,
        },
      }),
    ]);

    return { bidCredits: vendor.bidCredits, message: `${dto.credits} bid credits added` };
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Vendor: Stripe Connect Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

  async connectStripe(vendorProfileId: string, email: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });

    let stripeAccountId = vendor?.stripeAccountId;
    if (!stripeAccountId) {
      const account = await this.stripe.createConnectAccount(vendorProfileId, email);
      stripeAccountId = account.id;
      await this.prisma.vendorProfile.update({
        where: { id: vendorProfileId },
        data: { stripeAccountId },
      });
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const link = await this.stripe.createOnboardingLink(stripeAccountId, frontendUrl);
    return { url: link.url };
  }

  async getStripeConnectStatus(vendorProfileId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (!vendor?.stripeAccountId) return { connected: false };

    const status = await this.stripe.getAccountStatus(vendor.stripeAccountId);
    return { connected: true, ...status };
  }

  async getStripePortalLink(vendorProfileId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (!vendor?.stripeAccountId) throw new BadRequestException('No Stripe account');

    const link = await this.stripe.createExpressDashboardLink(vendor.stripeAccountId);
    return { url: link.url };
  }

  async updateVendorPayoutPreferences(vendorProfileId: string, dto: UpdateVendorPayoutPreferencesDto) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    if (!vendor.stripeAccountId) throw new BadRequestException('Connect a Stripe account first');
    const portal = await this.stripe.createExpressDashboardLink(vendor.stripeAccountId);
    return { message: 'Manage bank details and payout schedule in Stripe Express', url: portal.url };

    // In a production Stripe Connect account, bank accounts are tokenized via Stripe Elements or handled in Express portal
    return {
      message: 'Payout preferences saved successfully',
      preferences: {
        payoutSchedule: dto.payoutSchedule || 'Automatic Daily',
        bankName: dto.bankName || 'Direct Deposit Account',
        accountNumber: dto.accountNumber ? `Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ ${dto.accountNumber.slice(-4)}` : 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ 8912',
        routingNumber: dto.routingNumber || 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ 0210',
        instantDebitCard: dto.instantDebitCard || 'Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢Ã¢â‚¬Â¢ 4421 (Visa Debit)',
        stripeAccountId: vendor.stripeAccountId,
        payoutsEnabled: vendor.payoutsEnabled,
      },
    };
  }
}
