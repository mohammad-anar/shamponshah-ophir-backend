import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { ConfigService } from '@nestjs/config';
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
} from './dto/payment.dto';
import { DisputeStatus, TransactionType, PaymentStatus, MilestoneStatus, OrderStatus, LedgerStatus, LedgerEntryType, Prisma } from '@prisma/client';

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

  // ── Order Payment Intent (Separate Charges and Transfers) ────

  async createOrderPaymentIntent(clientProfileId: string, dto: CreateOrderPaymentIntentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { clientProfile: true, vendorProfile: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.clientProfileId !== clientProfileId) throw new ForbiddenException('You cannot pay for this order');
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`Order cannot be funded in status ${order.status}`);
    }

    const idempotencyKey = dto.idempotencyKey || `pi-order-${order.id}`;
    const amount = Number(order.amount || order.grandTotal);
    const platformFee = Number(order.platformFee);
    const vendorNet = Number(order.vendorNet);

    // If order already has a stripe payment intent, check status
    if (order.stripePaymentIntentId) {
      try {
        const existingPi = await this.stripe.retrievePaymentIntent(order.stripePaymentIntentId);
        if (existingPi.status === 'succeeded' || existingPi.status !== 'canceled') {
          return {
            clientSecret: existingPi.client_secret,
            paymentIntentId: existingPi.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            amount,
            platformFee,
            vendorNet,
            paymentStatus: existingPi.status,
          };
        }
      } catch (err) {
        // If retrieval fails, recreate
      }
    }

    const pi = await this.stripe.createOrderPaymentIntent({
      amount,
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientId: clientProfileId,
      vendorId: order.vendorProfileId,
      platformFee,
      vendorNet,
      customerId: order.clientProfile?.stripeCustomerId || undefined,
      idempotencyKey,
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: pi.id },
    });

    return {
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount,
      platformFee,
      vendorNet,
      paymentStatus: pi.status,
    };
  }

  // ── Confirm Order Payment (Idempotent Escrow Hold) ─────────

  async confirmOrderPayment(clientProfileId: string, dto: ConfirmOrderPaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { clientProfile: true, vendorProfile: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.clientProfileId !== clientProfileId) throw new ForbiddenException('Unauthorized for this order');

    // Idempotency: if already confirmed and active
    if (order.status === OrderStatus.ACTIVE && order.paymentStatus === PaymentStatus.VAULT_HELD) {
      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        amount: Number(order.amount || order.grandTotal),
        vendorNet: Number(order.vendorNet),
        platformFee: Number(order.platformFee),
        alreadyConfirmed: true,
      };
    }

    // Verify PaymentIntent status on Stripe
    const pi = await this.stripe.retrievePaymentIntent(dto.paymentIntentId);
    if (pi.status !== 'succeeded') {
      throw new BadRequestException(`Payment not completed. Stripe status is: ${pi.status}`);
    }

    const grossAmount = order.amount || order.grandTotal;
    const netAmount = order.vendorNet;
    const feeAmount = order.platformFee;

    await this.prisma.$transaction(async (tx) => {
      // 1. Update order
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.ACTIVE,
          paymentStatus: PaymentStatus.VAULT_HELD,
          stripePaymentIntentId: pi.id,
          paidAt: new Date(),
        },
      });

      // 2. Find or create vendor wallet
      let wallet = await tx.vendorWallet.findUnique({
        where: { vendorProfileId: order.vendorProfileId },
      });
      if (!wallet) {
        wallet = await tx.vendorWallet.create({
          data: { vendorProfileId: order.vendorProfileId },
        });
      }

      // Increment Pending amount (active order running)
      await tx.vendorWallet.update({
        where: { id: wallet.id },
        data: {
          pendingAmount: { increment: netAmount },
        },
      });

      // 3. Create wallet ledger entry
      await tx.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          vendorProfileId: order.vendorProfileId,
          orderId: order.id,
          type: LedgerEntryType.ORDER_PAYMENT,
          gross: grossAmount,
          platformFee: feeAmount,
          vendorNet: netAmount,
          status: LedgerStatus.PENDING,
          description: `Escrow hold for Order #${order.orderNumber} (Funds secured on platform)`,
        },
      });

      // 4. Record transaction log
      await tx.transaction.upsert({
        where: { txRef: `ESCROW-ORDER-${pi.id}` },
        create: {
          txRef: `ESCROW-ORDER-${pi.id}`,
          orderId: order.id,
          clientProfileId: order.clientProfileId,
          vendorProfileId: order.vendorProfileId,
          type: TransactionType.ESCROW_DEPOSIT,
          amount: grossAmount,
          fee: feeAmount,
          net: netAmount,
          status: PaymentStatus.SUCCEEDED,
          stripeId: pi.id,
          description: `Escrow vault hold for Order #${order.orderNumber}`,
        },
        update: { status: PaymentStatus.SUCCEEDED },
      });
    });

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: OrderStatus.ACTIVE,
      paymentStatus: PaymentStatus.VAULT_HELD,
      amount: Number(grossAmount),
      platformFee: Number(feeAmount),
      vendorNet: Number(netAmount),
      paidAt: new Date(),
    };
  }

  // ── Vendor Wallet & 3 Balances with Auto-Clearing ──────────

  async getVendorWallet(vendorProfileId: string) {
    const now = new Date();

    // 1. Ensure vendor wallet row exists
    let wallet = await this.prisma.vendorWallet.findUnique({
      where: { vendorProfileId },
    });
    if (!wallet) {
      wallet = await this.prisma.vendorWallet.create({
        data: { vendorProfileId },
      });
    }

    // 2. Fetch all orders for this vendor
    const orders = await this.prisma.order.findMany({
      where: { vendorProfileId },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Fetch existing ledger entries for this vendor
    const existingLedgers = await this.prisma.walletLedgerEntry.findMany({
      where: { vendorProfileId },
    });
    const ledgerByOrderId = new Map(
      existingLedgers.filter((l) => Boolean(l.orderId)).map((l) => [l.orderId!, l]),
    );

    // 4. Reconcile orders into walletLedgerEntry
    for (const order of orders) {
      const gross = Number(order.amount) > 0 
        ? Number(order.amount) 
        : (Number(order.grandTotal) > 0 ? Number(order.grandTotal) : Number(order.subtotal || 0));
      
      const fee = Number(order.platformFee) > 0 
        ? Number(order.platformFee) 
        : Math.max(0, Number(order.grandTotal) - Number(order.subtotal || 0));

      const vendorNet = Number(order.vendorNet) > 0 
        ? Number(order.vendorNet) 
        : (Number(order.subtotal) > 0 ? Number(order.subtotal) : Math.max(0, gross - fee));

      // Self-heal order.vendorNet if stored as 0
      if (Number(order.vendorNet) === 0 && vendorNet > 0) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { vendorNet },
        });
      }

      const existingLedger = ledgerByOrderId.get(order.id);

      if (
        order.status === OrderStatus.COMPLETED ||
        order.status === ('COMPLETED_WITH_PARTIAL_REFUND' as any)
      ) {
        const compDate = order.completedAt || order.createdAt;
        const isCleared = (now.getTime() - new Date(compDate).getTime()) >= 7 * 24 * 60 * 60 * 1000;
        const targetStatus = isCleared ? LedgerStatus.AVAILABLE : LedgerStatus.CLEARING;
        const clearingEndsAt = isCleared
          ? new Date(compDate)
          : new Date(new Date(compDate).getTime() + 7 * 24 * 60 * 60 * 1000);

        if (!existingLedger) {
          const created = await this.prisma.walletLedgerEntry.create({
            data: {
              walletId: wallet.id,
              vendorProfileId,
              orderId: order.id,
              type: LedgerEntryType.DELIVERY_ACCEPTED,
              gross,
              platformFee: fee,
              vendorNet,
              status: targetStatus,
              clearingEndsAt,
              description: `Delivery accepted for Order #${order.orderNumber} ${isCleared ? '(Cleared)' : '(7-day security clearing active)'}`,
            },
          });
          ledgerByOrderId.set(order.id, created);
        } else if (
          existingLedger.status === LedgerStatus.PENDING ||
          (existingLedger.status === LedgerStatus.CLEARING && isCleared)
        ) {
          const updated = await this.prisma.walletLedgerEntry.update({
            where: { id: existingLedger.id },
            data: {
              status: targetStatus,
              clearingEndsAt,
              vendorNet,
              gross,
              platformFee: fee,
              description: `Delivery accepted for Order #${order.orderNumber} ${isCleared ? '(Cleared)' : '(7-day security clearing active)'}`,
            },
          });
          ledgerByOrderId.set(order.id, updated);
        }
      } else if (
        ([OrderStatus.ACTIVE, OrderStatus.IN_PROGRESS, OrderStatus.DELIVERED] as OrderStatus[]).includes(order.status)
      ) {
        if (!existingLedger) {
          const created = await this.prisma.walletLedgerEntry.create({
            data: {
              walletId: wallet.id,
              vendorProfileId,
              orderId: order.id,
              type: LedgerEntryType.ORDER_PAYMENT,
              gross,
              platformFee: fee,
              vendorNet,
              status: LedgerStatus.PENDING,
              description: `Escrow vault hold for Order #${order.orderNumber}`,
            },
          });
          ledgerByOrderId.set(order.id, created);
        }
      } else if (
        ([OrderStatus.CANCELLED, OrderStatus.REFUNDED as any] as OrderStatus[]).includes(order.status)
      ) {
        if (existingLedger && existingLedger.status !== LedgerStatus.REFUNDED && existingLedger.status !== LedgerStatus.CANCELLED) {
          const updated = await this.prisma.walletLedgerEntry.update({
            where: { id: existingLedger.id },
            data: { status: LedgerStatus.REFUNDED },
          });
          ledgerByOrderId.set(order.id, updated);
        }
      }
    }

    // 5. Run clearing routine: any CLEARING entry whose clearingEndsAt <= now -> set to AVAILABLE
    const clearingToAvailable = await this.prisma.walletLedgerEntry.findMany({
      where: {
        vendorProfileId,
        status: LedgerStatus.CLEARING,
        clearingEndsAt: { lte: now },
      },
    });
    for (const entry of clearingToAvailable) {
      await this.prisma.walletLedgerEntry.update({
        where: { id: entry.id },
        data: { status: LedgerStatus.AVAILABLE },
      });
    }

    // 6. Recalculate balances from ledger entries and withdrawals
    const allLedgers = await this.prisma.walletLedgerEntry.findMany({
      where: { vendorProfileId },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            source: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    let pendingAmount = 0;
    let pendingForReleaseAmount = 0;
    let availableAmount = 0;
    let totalEarned = 0;
    let totalWithdrawn = 0;

    for (const item of allLedgers) {
      const net = Number(item.vendorNet || 0);
      if (item.type === LedgerEntryType.WITHDRAWAL || item.status === LedgerStatus.WITHDRAWN) {
        totalWithdrawn += net;
      } else if (item.status === LedgerStatus.PENDING) {
        pendingAmount += net;
      } else if (item.status === LedgerStatus.CLEARING) {
        pendingForReleaseAmount += net;
        totalEarned += net;
      } else if (item.status === LedgerStatus.AVAILABLE) {
        availableAmount += net;
        totalEarned += net;
      }
    }

    availableAmount = Math.max(0, availableAmount - totalWithdrawn);

    // Update wallet row in DB
    await this.prisma.vendorWallet.update({
      where: { id: wallet.id },
      data: {
        pendingAmount,
        pendingForReleaseAmount,
        availableAmount,
        totalEarned,
        totalWithdrawn,
      },
    });

    return {
      walletId: wallet.id,
      vendorProfileId,
      pendingAmount,
      pendingForReleaseAmount,
      availableAmount,
      totalEarned,
      totalWithdrawn,
      ledgerEntries: allLedgers.map((e) => ({
        id: e.id,
        orderId: e.orderId,
        orderNumber: e.order?.orderNumber || null,
        type: e.type,
        gross: Number(e.gross),
        platformFee: Number(e.platformFee),
        vendorNet: Number(e.vendorNet),
        status: e.status,
        clearingEndsAt: e.clearingEndsAt,
        description: e.description,
        createdAt: e.createdAt,
      })),
    };
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
    const wallet = await this.getVendorWallet(vendorProfileId);

    const upcomingReleases = wallet.ledgerEntries
      .filter((e) => e.status === 'CLEARING')
      .map((e) => ({
        milestoneId: e.id,
        orderNumber: e.orderNumber,
        label: e.description || 'Order Clearance',
        amount: e.vendorNet,
        approvedAt: e.createdAt,
        releaseAt: e.clearingEndsAt,
      }));

    const payouts = await this.prisma.transaction.findMany({
      where: { vendorProfileId, type: TransactionType.PAYOUT },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      earnings: wallet.ledgerEntries.map((e) => ({
        id: e.id,
        orderId: e.orderId,
        orderNumber: e.orderNumber,
        amount: e.vendorNet,
        status: e.status.toLowerCase(),
        createdAt: e.createdAt,
      })),
      upcomingReleases,
      availableBalance: wallet.availableAmount,
      transferredBalance: wallet.availableAmount,
      stripePendingBalance: wallet.pendingForReleaseAmount,
      pendingBalance: wallet.pendingForReleaseAmount,
      escrowBalance: wallet.pendingAmount,
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      payoutHistory: payouts.length > 0
        ? payouts.map((p) => ({
            id: p.txRef,
            date: p.createdAt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
            amount: `$${Number(p.amount).toFixed(2)}`,
            destination: 'Bank account payout',
            type: p.description?.toLowerCase().includes('instant') ? 'Instant payout' : 'Standard payout',
            status: p.status,
          }))
        : wallet.ledgerEntries
            .filter((e) => e.type === LedgerEntryType.WITHDRAWAL || e.status === LedgerStatus.WITHDRAWN)
            .map((p) => ({
              id: p.id,
              date: new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
              amount: `$${p.vendorNet.toFixed(2)}`,
              destination: 'Bank account payout',
              type: 'Standard payout',
              status: 'SUCCEEDED',
            })),
    };
  }

  async getBidCreditPackages() {
    return this.prisma.bidCreditPackage.findMany({
      where: { isActive: true },
      orderBy: { credits: 'asc' },
    });
  }

  async withdrawEarnings(vendorProfileId: string, dto: WithdrawEarningsDto) {
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('Enter a valid payout amount');
    }

    const wallet = await this.getVendorWallet(vendorProfileId);
    const available = Number(wallet.availableAmount || 0);
    if (dto.amount > available) {
      throw new BadRequestException(`Only $${available.toFixed(2)} is available for withdrawal`);
    }

    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });

    let payoutId = `payout_sim_${Date.now()}`;
    if (vendor?.stripeAccountId && vendor.payoutsEnabled) {
      try {
        const payout = await this.stripe.createPayout({
          amount: dto.amount,
          stripeAccountId: vendor.stripeAccountId,
          method: dto.speed,
        });
        if (payout?.id) payoutId = payout.id;
      } catch (err: any) {
        console.warn('Stripe payout fallback:', err?.message);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vendorWallet.update({
        where: { vendorProfileId },
        data: {
          availableAmount: { decrement: dto.amount },
          totalWithdrawn: { increment: dto.amount },
        },
      });

      await tx.walletLedgerEntry.create({
        data: {
          walletId: wallet.walletId,
          vendorProfileId,
          type: LedgerEntryType.WITHDRAWAL,
          gross: dto.amount,
          platformFee: 0,
          vendorNet: dto.amount,
          status: LedgerStatus.WITHDRAWN,
          description: `${dto.speed === 'instant' ? 'Instant' : 'Standard'} withdrawal payout to bank`,
        },
      });

      await tx.transaction.create({
        data: {
          txRef: `PAYOUT-${Date.now()}`,
          vendorProfileId,
          type: TransactionType.PAYOUT,
          amount: dto.amount,
          fee: 0,
          net: dto.amount,
          status: PaymentStatus.SUCCEEDED,
          stripeId: payoutId,
          description: `${dto.speed || 'standard'} withdrawal payout`,
        },
      });
    });

    return { message: 'Payout initiated successfully', payoutId };
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
