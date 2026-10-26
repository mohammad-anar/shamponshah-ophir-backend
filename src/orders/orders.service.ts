import { Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { CreateOrderDto, ApproveMilestoneDto, DeclineDeliveryDto, SubmitMilestoneDto, CreateReviewDto, CreateDisputeDto, OrderQueryDto, CancelOrderDto, RespondDisputeDto, TransitionOrderDto, RequestRevisionDto, DeliverOrderDto } from './dto/order.dto';
import { OrderStatus, MilestoneStatus, TransactionType, PaymentStatus, DisputeStatus, NotificationType, Prisma, Role, OrderSource, LedgerStatus, LedgerEntryType } from '@prisma/client';
import { validateOrderTransition, normalizeOrderStatus, canTransitionOrder, ActorRole } from './order-state-machine';

const PLATFORM_FEE_PERCENT = 15;
const VENDOR_NET_PERCENT = 85;

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private releaseInterval?: NodeJS.Timeout;
  private releaseWorkerRunning = false;
  private clearingWorkerRunning = false;
  private autoCompleteWorkerRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    @Inject(forwardRef(() => MessagesGateway))
    private readonly messagesGateway: MessagesGateway,
  ) {}

  onModuleInit() {
    void this.releaseApprovedMilestones();
    void this.cancelExpiredUnpaidOrders();
    void this.processSecurityClearingTransfers();
    void this.autoCompleteDeliveredOrders();
    this.releaseInterval = setInterval(() => {
      void this.releaseApprovedMilestones();
      void this.cancelExpiredUnpaidOrders();
      void this.processSecurityClearingTransfers();
      void this.autoCompleteDeliveredOrders();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.releaseInterval) clearInterval(this.releaseInterval);
  }

  private async releaseApprovedMilestones() {
    if (this.releaseWorkerRunning) return;
    this.releaseWorkerRunning = true;
    try {
      const due = await this.prisma.milestone.findMany({
        where: {
          status: MilestoneStatus.APPROVED_PENDING_RELEASE,
          releaseAt: { lte: new Date() },
        },
        include: { order: { include: { vendorProfile: true } } },
        take: 50,
        orderBy: { releaseAt: 'asc' },
      });

      for (const milestone of due) {
        const order = milestone.order;
        const vendorAccountId = order.vendorProfile.stripeAccountId;
        if (order.status === OrderStatus.DISPUTED || order.status === OrderStatus.CANCELLED) continue;
        if (!vendorAccountId || !milestone.stripePaymentIntentId) continue;

        try {
          const transfer = await this.stripe.transferMilestone({
            amount: Number(milestone.amount),
            vendorStripeAccountId: vendorAccountId,
            orderId: order.id,
            milestoneId: milestone.id,
            paymentIntentId: milestone.stripePaymentIntentId,
          });

          const released = await this.prisma.$transaction(async (tx) => {
            const result = await tx.milestone.updateMany({
              where: {
                id: milestone.id,
                status: MilestoneStatus.APPROVED_PENDING_RELEASE,
                releaseAt: { lte: new Date() },
              },
              data: {
                status: MilestoneStatus.RELEASED,
                releasedAt: new Date(),
                stripeTransferId: transfer.id,
              },
            });
            if (!result.count) return false;

            await tx.earning.upsert({
              where: { milestoneId: milestone.id },
              create: {
                vendorProfileId: order.vendorProfileId,
                orderId: order.id,
                milestoneId: milestone.id,
                amount: milestone.amount,
                status: 'available',
                stripeTransferId: transfer.id,
              },
              update: { status: 'available', stripeTransferId: transfer.id },
            });
            await tx.transaction.upsert({
              where: { txRef: `TRANSFER-${transfer.id}` },
              create: {
                txRef: `TRANSFER-${transfer.id}`,
                orderId: order.id,
                vendorProfileId: order.vendorProfileId,
                clientProfileId: order.clientProfileId,
                type: TransactionType.MILESTONE_RELEASE,
                amount: milestone.amount,
                fee: 0,
                net: milestone.amount,
                status: PaymentStatus.SUCCEEDED,
                stripeId: transfer.id,
                description: `Milestone transfer: ${milestone.label}`,
                metadata: { milestoneId: milestone.id },
              },
              update: { status: PaymentStatus.SUCCEEDED },
            });
            return true;
          });

          if (released && order.vendorProfile.userId) {
            await this.prisma.notification.create({
              data: {
                userId: order.vendorProfile.userId,
                type: NotificationType.MILESTONE_RELEASED,
                title: `Milestone funds transferred (#${order.orderNumber})`,
                body: `Stripe Connect transfer for "${milestone.label}" was created. Bank payout timing depends on Stripe.`,
                link: '/vendor/earnings',
              },
            }).catch(() => null);
          }
        } catch (error: any) {
          console.error(`Milestone transfer failed for ${milestone.id}; it will be retried.`, error?.message || error);
        }
      }
    } catch (error: any) {
      console.error('Milestone release worker failed.', error?.message || error);
    } finally {
      this.releaseWorkerRunning = false;
    }
  }

  async createOrder(clientProfileId: string, dto: CreateOrderDto) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findFirst({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { milestones: true, gig: true, clientProfile: true, vendorProfile: true },
      });
      if (existing) return existing;
    }

    let vendorProfileId: string | undefined;
    let gigId: string | undefined;
    let packageId: string | undefined;
    let jobId: string | undefined;
    let offerId: string | undefined;
    let subtotal: any;
    let escrowSplit: any[] = [];

    if (dto.packageId) {
      // Gig booking
      const pkg = await this.prisma.gigPackage.findUnique({
        where: { id: dto.packageId },
        include: { gig: true },
      });
      if (pkg) {
        vendorProfileId = pkg.vendorProfileId;
        gigId = pkg.gigId;
        packageId = pkg.id;
        subtotal = pkg.price;
        escrowSplit = (pkg.escrowSplitJson as any[]) || [
          { label: 'Booking Deposit (50%)', percentage: 50 },
          { label: 'Post-Event Signoff (50%)', percentage: 50 },
        ];
      }
    }

    if (!vendorProfileId && dto.offerId) {
      // Accepted offer
      const offer = await this.prisma.offer.findUnique({
        where: { id: dto.offerId },
        include: { job: true },
      });
      if (!offer) throw new NotFoundException('Offer not found');

      vendorProfileId = offer.vendorProfileId;
      jobId = offer.jobId;
      offerId = offer.id;
      subtotal = offer.price;

      const splitJson: any = offer.escrowSplitJson;
      if (splitJson && splitJson.type === 'FULL') {
        escrowSplit = [
          {
            label: splitJson.milestones?.[0]?.label || 'Full Project Payment (100%)',
            percentage: 100,
            amount: subtotal,
            note: 'Payable upon order completion & final delivery sign-off.',
          },
        ];
      } else if (splitJson && splitJson.type === 'MILESTONE' && Array.isArray(splitJson.milestones) && splitJson.milestones.length > 0) {
        escrowSplit = splitJson.milestones.map((m: any, idx: number) => ({
          label: m.label || `Milestone ${idx + 1}`,
          percentage: Number(m.percentage) || Math.round(100 / splitJson.milestones.length),
          amount: m.amount ? new Prisma.Decimal(m.amount) : undefined,
          note: m.note,
        }));
      } else if (Array.isArray(splitJson) && splitJson.length > 0) {
        escrowSplit = splitJson;
      } else {
        escrowSplit = [
          { label: 'Booking Deposit (50%)', percentage: 50 },
          { label: 'Final Delivery (50%)', percentage: 50 },
        ];
      }
    }

    if (!vendorProfileId && dto.vendorProfileId) {
      const vendor = await this.prisma.vendorProfile.findFirst({
        where: { OR: [{ id: dto.vendorProfileId }, { slug: dto.vendorProfileId }] },
      });
      if (!vendor) throw new NotFoundException('Vendor profile not found');
      vendorProfileId = vendor.id;
      subtotal = new Prisma.Decimal(dto.subtotal || 500);
      escrowSplit = [
        { label: 'Booking Retainer (30%)', percentage: 30 },
        { label: 'Day-of Execution (50%)', percentage: 50 },
        { label: 'Final Deliverables Sign-Off (20%)', percentage: 20 },
      ];
    }

    if (!vendorProfileId) {
      throw new BadRequestException('Either packageId, offerId, or vendorProfileId is required');
    }

    const calculatedGrand = subtotal.add(subtotal.mul(PLATFORM_FEE_PERCENT / 100).toDecimalPlaces(2));
    const totalAmount = dto.amount ? new Prisma.Decimal(dto.amount) : calculatedGrand;
    const platformFee = totalAmount.mul(PLATFORM_FEE_PERCENT / 100).toDecimalPlaces(2);
    const vendorNet = totalAmount.mul(VENDOR_NET_PERCENT / 100).toDecimalPlaces(2);
    const orderSource = dto.source ? (dto.source as OrderSource) : (gigId || packageId ? OrderSource.GIG : OrderSource.JOB);
    const orderNumber = `JB-${Date.now().toString().slice(-5)}`;

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        clientProfileId,
        vendorProfileId,
        source: orderSource,
        gigId,
        packageId,
        jobId,
        offerId,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : undefined,
        deliveryNotes: dto.deliveryNotes,
        addonsJson: dto.addonsJson,
        amount: totalAmount,
        subtotal,
        platformFee,
        vendorNet,
        grandTotal: totalAmount,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        idempotencyKey: dto.idempotencyKey,
        milestones: {
          create: escrowSplit.map((m, i) => ({
            label: m.label,
            percentage: m.percentage,
            amount: subtotal.mul(m.percentage / 100).toDecimalPlaces(2),
            status: MilestoneStatus.LOCKED,
            sortOrder: i,
          })),
        },
      },
      include: { milestones: true, clientProfile: true, vendorProfile: true },
    });

    return order;
  }

  async transitionOrder(orderId: string, role: ActorRole, dto: TransitionOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { vendorProfile: true, clientProfile: true, milestones: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const targetStatus = normalizeOrderStatus(dto.status);
    validateOrderTransition(order.status, targetStatus, role);

    const now = new Date();
    const updateData: any = {
      status: targetStatus,
    };

    if (targetStatus === OrderStatus.ACTIVE) {
      updateData.paidAt = now;
      updateData.paymentStatus = PaymentStatus.VAULT_HELD;
    } else if (targetStatus === OrderStatus.DELIVERED) {
      updateData.deliveredAt = now;
    } else if (targetStatus === OrderStatus.COMPLETED) {
      updateData.completedAt = now;
      updateData.paymentStatus = PaymentStatus.SUCCEEDED;

      // Update Vendor Wallet: move from pending to pendingForRelease (7-day clearing)
      let wallet = await this.prisma.vendorWallet.findUnique({
        where: { vendorProfileId: order.vendorProfileId },
      });
      if (!wallet) {
        wallet = await this.prisma.vendorWallet.create({
          data: { vendorProfileId: order.vendorProfileId },
        });
      }

      const netAmount = Number(order.vendorNet || order.subtotal.mul(0.85));
      const clearingEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await this.prisma.vendorWallet.update({
        where: { id: wallet.id },
        data: {
          pendingAmount: { decrement: netAmount > Number(wallet.pendingAmount) ? wallet.pendingAmount : netAmount },
          pendingForReleaseAmount: { increment: netAmount },
        },
      });

      await this.prisma.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          vendorProfileId: order.vendorProfileId,
          orderId: order.id,
          type: LedgerEntryType.DELIVERY_ACCEPTED,
          gross: order.amount || order.grandTotal,
          platformFee: order.platformFee,
          vendorNet: order.vendorNet,
          status: LedgerStatus.CLEARING,
          clearingEndsAt,
          description: `Delivery accepted for Order #${order.orderNumber} (7-day security clearing active)`,
        },
      });
    } else if (targetStatus === OrderStatus.CANCELLED || targetStatus === OrderStatus.REFUNDED) {
      updateData.cancelledAt = now;
      updateData.paymentStatus = PaymentStatus.REFUNDED;

      const wallet = await this.prisma.vendorWallet.findUnique({
        where: { vendorProfileId: order.vendorProfileId },
      });
      if (wallet && Number(wallet.pendingAmount) > 0) {
        const netAmount = Number(order.vendorNet || order.subtotal.mul(0.85));
        await this.prisma.vendorWallet.update({
          where: { id: wallet.id },
          data: {
            pendingAmount: { decrement: Math.min(Number(wallet.pendingAmount), netAmount) },
          },
        });
        await this.prisma.walletLedgerEntry.create({
          data: {
            walletId: wallet.id,
            vendorProfileId: order.vendorProfileId,
            orderId: order.id,
            type: LedgerEntryType.REFUND_DEDUCTION,
            gross: order.amount || order.grandTotal,
            platformFee: order.platformFee,
            vendorNet: order.vendorNet,
            status: LedgerStatus.CANCELLED,
            description: `Order #${order.orderNumber} ${targetStatus.toLowerCase()} - escrow reversed`,
          },
        });
      }
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: { milestones: true, vendorProfile: true, clientProfile: true },
    });

    return updated;
  }

  async getClientOrders(clientProfileId: string, query: OrderQueryDto) {
    const where: any = { clientProfileId };
    if (query.status) where.status = query.status;

    return this.prisma.order.findMany({
      where,
      include: {
        vendorProfile: { select: { businessName: true, avatarUrl: true } },
        gig: { select: { title: true } },
        milestones: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVendorOrders(vendorProfileId: string, query: OrderQueryDto, userId?: string) {
    let resolvedVendorProfileId = vendorProfileId;
    if (!resolvedVendorProfileId && userId) {
      const vendor = await this.prisma.vendorProfile.findFirst({ where: { userId } });
      if (vendor) resolvedVendorProfileId = vendor.id;
    }
    const where: any = resolvedVendorProfileId ? { vendorProfileId: resolvedVendorProfileId } : {};
    if (query.status) where.status = query.status;

    return this.prisma.order.findMany({
      where,
      include: {
        clientProfile: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            userId: true,
            phone: true,
            user: { select: { id: true, email: true } },
          },
        },
        vendorProfile: {
          select: {
            id: true,
            businessName: true,
            avatarUrl: true,
            userId: true,
          },
        },
        gig: { select: { id: true, title: true } },
        job: { select: { id: true, title: true } },
        milestones: { orderBy: { sortOrder: 'asc' } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrderById(orderId: string, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        clientProfile: {
          select: {
            id: true,
            userId: true,
            displayName: true,
            avatarUrl: true,
            phone: true,
            user: { select: { id: true, email: true } },
          },
        },
        vendorProfile: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            avatarUrl: true,
            phone: true,
            stripeAccountId: true,
            user: { select: { id: true, email: true } },
          },
        },
        gig: true,
        package: true,
        job: true,
        milestones: { orderBy: { sortOrder: 'asc' } },
        transactions: { orderBy: { createdAt: 'desc' } },
        orderReviews: true,
        disputes: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Flow B: If unpaid order is older than 24 hours, auto-cancel it
    const isUnpaid = order.status === OrderStatus.PENDING_PAYMENT;
    const isPast24Hours = Date.now() - new Date(order.createdAt).getTime() > 24 * 60 * 60 * 1000;
    if (isUnpaid && isPast24Hours) {
      const cancelled = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: new Date(),
          deliveryNotes: order.deliveryNotes
            ? `${order.deliveryNotes} | Auto-cancelled: 24h unpaid payment window expired.`
            : 'Auto-cancelled: 24h unpaid payment window expired.',
        },
        include: {
          clientProfile: true,
          vendorProfile: true,
          gig: true,
          package: true,
          job: true,
          milestones: true,
          transactions: true,
          orderReviews: true,
          disputes: true,
        },
      });
      return cancelled;
    }

    return order;
  }

  async cancelExpiredUnpaidOrders() {
    try {
      const expiredCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const expiredOrders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.PENDING_PAYMENT,
          createdAt: { lte: expiredCutoff },
        },
      });

      for (const order of expiredOrders) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            deliveryNotes: order.deliveryNotes
              ? `${order.deliveryNotes} | Auto-cancelled: 24h unpaid expiration.`
              : 'Auto-cancelled: 24h unpaid expiration.',
          },
        });
      }
    } catch (_) {}
  }

  async submitMilestone(orderId: string, milestoneId: string, vendorProfileId: string, dto: SubmitMilestoneDto, userId?: string) {
    let resolvedVendorProfileId = vendorProfileId;
    if (!resolvedVendorProfileId && userId) {
      const vendor = await this.prisma.vendorProfile.findFirst({ where: { userId } });
      if (vendor) resolvedVendorProfileId = vendor.id;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { milestones: true, clientProfile: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (resolvedVendorProfileId && order.vendorProfileId && order.vendorProfileId !== resolvedVendorProfileId) {
      throw new BadRequestException('Unauthorized');
    }

    const milestone = order.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.status !== MilestoneStatus.FUNDED) {
      throw new BadRequestException('This milestone must be paid before delivery can be submitted');
    }

    const updated = await this.prisma.milestone.update({
      where: { id: milestone.id },
      data: {
        status: MilestoneStatus.PENDING_RELEASE,
        note: dto.notes || (dto.proofUrl ? `Delivery Proof: ${dto.proofUrl}` : undefined),
      },
    });

    // Update order status to IN_PROGRESS if ACTIVE/PENDING
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.IN_PROGRESS,
        deliveryNotes: dto.notes
          ? `${dto.notes}${dto.proofUrl ? ` | Proof: ${dto.proofUrl}` : ''}`
          : order.deliveryNotes,
      },
    });

    if (order.clientProfile?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: order.clientProfile.userId,
          type: NotificationType.GENERAL,
          title: `Milestone Delivery Submitted (#${order.orderNumber})`,
          body: `Vendor submitted work for "${milestone.label}". Please review and release escrow.`,
          link: `/user/orders`,
        },
      }).catch(() => null);
    }

    return updated;
  }

  async deliverOrderWithFiles(
    orderId: string,
    vendorProfileId: string,
    body: any,
    files?: any[],
    userId?: string,
    userRole?: Role,
  ) {
    let resolvedVendorProfileId = vendorProfileId;
    if (!resolvedVendorProfileId && userId) {
      const vendor = await this.prisma.vendorProfile.findFirst({ where: { userId } });
      if (vendor) resolvedVendorProfileId = vendor.id;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { milestones: true, clientProfile: true, vendorProfile: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (userRole !== Role.ADMIN) {
      if (resolvedVendorProfileId && order.vendorProfileId && order.vendorProfileId !== resolvedVendorProfileId) {
        throw new ForbiddenException('You are not authorized to deliver this order');
      }
      if (userId && order.vendorProfile?.userId && order.vendorProfile.userId !== userId) {
        throw new ForbiddenException('You are not authorized to deliver this order');
      }
    }

    // State machine check
    if (order.status === OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Cannot deliver an unpaid order. Escrow payment must be funded first.');
    }
    if (order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('This order is already completed.');
    }
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException('Cannot deliver a cancelled or refunded order.');
    }
    if (order.status === OrderStatus.DISPUTED) {
      throw new BadRequestException('This order is currently under dispute review.');
    }

    // Server-side validation: At least 1 file/image is mandatory!
    const hasUploadedFiles = Array.isArray(files) && files.length > 0;
    const existingUrls = Array.isArray(body?.fileUrls)
      ? body.fileUrls
      : typeof body?.fileUrls === 'string' && body.fileUrls
      ? [body.fileUrls]
      : [];

    if (!hasUploadedFiles && existingUrls.length === 0) {
      throw new BadRequestException(
        'Empty delivery is not allowed! At least one file or image is mandatory for order delivery.',
      );
    }

    // Server-side validation: message is mandatory (at least 5 characters)!
    const deliveryMessage = (body?.message || body?.notes || '').trim();
    if (!deliveryMessage || deliveryMessage.length < 5) {
      throw new BadRequestException(
        'A proper delivery message explaining the completed work is mandatory (at least 5 characters).',
      );
    }

    const uploadedMeta = (files || []).map((f) => ({
      url: `/uploads/${f.filename}`,
      filename: f.filename,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    }));

    const urlMeta = existingUrls.map((u: string) => ({
      url: u,
      filename: u.split('/').pop() || 'deliverable',
      originalName: u.split('/').pop() || 'deliverable',
      mimetype: 'application/octet-stream',
      size: 0,
    }));

    const allDeliverableMeta = [...uploadedMeta, ...urlMeta];
    const allDeliverableUrls = allDeliverableMeta.map((m) => m.url);

    const now = new Date();
    // 3 days review window before auto-complete
    const autoCompleteAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const deliveryRecord = {
      id: `del_${Date.now()}`,
      round: (order.revisionCount || 0) + 1,
      message: deliveryMessage,
      files: allDeliverableMeta,
      deliveredAt: now.toISOString(),
      autoCompleteAt: autoCompleteAt.toISOString(),
    };

    const prevDeliveries = Array.isArray(order.deliveries) ? (order.deliveries as any[]) : [];
    const updatedDeliveries = [...prevDeliveries, deliveryRecord];

    // Transition order to DELIVERED
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredAt: now,
        autoCompleteAt,
        deliveryNotes: deliveryMessage,
        deliveryFiles: allDeliverableUrls,
        deliveries: updatedDeliveries,
      },
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        clientProfile: true,
        vendorProfile: true,
      },
    });

    // If order has milestones, mark any FUNDED milestone as PENDING_RELEASE
    if (order.milestones.length > 0) {
      await this.prisma.milestone.updateMany({
        where: {
          orderId,
          status: MilestoneStatus.FUNDED,
        },
        data: {
          status: MilestoneStatus.PENDING_RELEASE,
          note: deliveryMessage,
        },
      });
    }

    // Realtime socket emission to order room
    this.messagesGateway.notifyOrderRoom(order.id, 'order_status_updated', {
      orderId: order.id,
      status: OrderStatus.DELIVERED,
      delivery: deliveryRecord,
      order: updatedOrder,
    });

    // Realtime notification in DB for client
    if (order.clientProfile?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: order.clientProfile.userId,
          type: NotificationType.GENERAL,
          title: `Order Delivered (#${order.orderNumber})`,
          body: `Vendor delivered work with ${allDeliverableMeta.length} deliverable file(s). Review deliverables to accept or request revisions within 3 days.`,
          link: `/user/orders/${order.id}`,
        },
      }).catch(() => null);
    }

    return {
      success: true,
      message: 'Order delivered successfully. Client has been notified to review.',
      order: updatedOrder,
      delivery: deliveryRecord,
    };
  }

  async deliverOrder(orderId: string, vendorProfileId: string, dto: SubmitMilestoneDto, userId?: string) {
    return this.deliverOrderWithFiles(
      orderId,
      vendorProfileId,
      { message: dto.notes || 'Full order work delivered', fileUrls: dto.proofUrl ? [dto.proofUrl] : [] },
      undefined,
      userId,
    );
  }

  async approveMilestone(orderId: string, milestoneId: string, clientProfileId: string, dto: ApproveMilestoneDto, userId?: string) {
    let resolvedClientProfileId = clientProfileId;
    if (!resolvedClientProfileId && userId) {
      const profile = await this.prisma.clientProfile.findUnique({ where: { userId } });
      if (profile) resolvedClientProfileId = profile.id;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { milestones: true, vendorProfile: true, clientProfile: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (resolvedClientProfileId && order.clientProfileId !== resolvedClientProfileId) {
      throw new BadRequestException('Unauthorized');
    }

    const milestone = order.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.status === MilestoneStatus.APPROVED_PENDING_RELEASE || milestone.status === MilestoneStatus.RELEASED) {
      return { success: true, message: 'Milestone approval is already recorded', releaseAt: milestone.releaseAt };
    }
    if (milestone.status !== MilestoneStatus.PENDING_RELEASE) {
      throw new BadRequestException('Vendor must submit this funded milestone before client approval');
    }

    const now = new Date();
    const releaseAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const approval = await this.prisma.milestone.updateMany({
      where: { id: milestoneId, status: MilestoneStatus.PENDING_RELEASE },
      data: {
        status: MilestoneStatus.APPROVED_PENDING_RELEASE,
        approvedAt: now,
        releaseAt,
        note: dto?.note || 'Client approved delivery; Stripe Connect transfer scheduled after the 7-day hold.',
      },
    });
    if (!approval.count) throw new BadRequestException('Milestone approval was already recorded');

    await this.prisma.earning.upsert({
      where: { milestoneId },
      create: { vendorProfileId: order.vendorProfileId, orderId: order.id, milestoneId, amount: milestone.amount, status: 'pending' },
      update: { status: 'pending' },
    });

    const isCompleted = order.milestones.every((item) =>
      item.id === milestoneId || ([MilestoneStatus.APPROVED_PENDING_RELEASE, MilestoneStatus.RELEASED, MilestoneStatus.REFUNDED] as MilestoneStatus[]).includes(item.status),
    );
    if (isCompleted) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: now,
          clearingEndsAt: releaseAt,
          autoCompleteAt: null,
          paymentStatus: PaymentStatus.SUCCEEDED,
        },
      });
    }

    // Notify vendor
    if (order.vendorProfile?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: order.vendorProfile.userId,
          type: NotificationType.MILESTONE_RELEASED,
          title: `Milestone Approved (#${order.orderNumber})`,
          body: `Client approved "${milestone.label}" ($${milestone.amount}). Stripe Connect transfer is scheduled for ${releaseAt.toISOString()}.`,
          link: `/vendor/orders`,
        },
      }).catch(() => null);
    }

    return {
      success: true,
      message: 'Milestone approved. Funds are scheduled to transfer after the 7-day hold.',
      releaseAt,
      orderCompleted: isCompleted,
    };
  }

  async acceptDelivery(
    orderId: string,
    clientProfileId?: string,
    dto?: ApproveMilestoneDto,
    userId?: string,
    isSystem = false,
  ) {
    let resolvedClientProfileId = clientProfileId;
    if (!resolvedClientProfileId && userId) {
      const profile = await this.prisma.clientProfile.findUnique({ where: { userId } });
      if (profile) resolvedClientProfileId = profile.id;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { milestones: true, vendorProfile: true, clientProfile: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (!isSystem) {
      if (resolvedClientProfileId && order.clientProfileId !== resolvedClientProfileId) {
        throw new ForbiddenException('Unauthorized: Only the client can accept delivery');
      }
      if (userId && order.clientProfile?.userId && order.clientProfile.userId !== userId) {
        throw new ForbiddenException('Unauthorized: Only the client can accept delivery');
      }
    }

    if (order.status === OrderStatus.COMPLETED) {
      return { success: true, message: 'Order is already completed', order };
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        `Order cannot be accepted in status "${order.status}". Vendor must deliver the order first.`,
      );
    }

    const now = new Date();
    // 7-day security clearing begins!
    const clearingEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Update order status to COMPLETED. Do NOT charge client again!
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.COMPLETED,
        completedAt: now,
        clearingEndsAt,
        autoCompleteAt: null,
        paymentStatus: PaymentStatus.SUCCEEDED,
      },
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        clientProfile: true,
        vendorProfile: true,
      },
    });

    // Update Vendor Wallet: Move amount to pendingForReleaseAmount
    let wallet = await this.prisma.vendorWallet.findUnique({
      where: { vendorProfileId: order.vendorProfileId },
    });
    if (!wallet) {
      wallet = await this.prisma.vendorWallet.create({
        data: { vendorProfileId: order.vendorProfileId },
      });
    }

    const netAmount = Number(order.vendorNet || order.subtotal.mul(0.85));

    await this.prisma.vendorWallet.update({
      where: { id: wallet.id },
      data: {
        pendingAmount: {
          decrement: Math.min(Number(wallet.pendingAmount), netAmount),
        },
        pendingForReleaseAmount: { increment: netAmount },
      },
    });

    // Record ledger entry in CLEARING status
    await this.prisma.walletLedgerEntry.create({
      data: {
        walletId: wallet.id,
        vendorProfileId: order.vendorProfileId,
        orderId: order.id,
        type: LedgerEntryType.DELIVERY_ACCEPTED,
        gross: order.amount || order.grandTotal,
        platformFee: order.platformFee,
        vendorNet: order.vendorNet,
        status: LedgerStatus.CLEARING,
        clearingEndsAt,
        description: isSystem
          ? `Auto-completed after 3 days without client response for Order #${order.orderNumber} (7-day security clearing active)`
          : `Client accepted delivery for Order #${order.orderNumber} (7-day security clearing active)`,
      },
    });

    // Update any milestones to APPROVED_PENDING_RELEASE with releaseAt = clearingEndsAt
    if (order.milestones.length > 0) {
      await this.prisma.milestone.updateMany({
        where: { orderId },
        data: {
          status: MilestoneStatus.APPROVED_PENDING_RELEASE,
          approvedAt: now,
          releaseAt: clearingEndsAt,
        },
      });
    }

    // Real-time socket broadcast to order room
    this.messagesGateway.notifyOrderRoom(order.id, 'order_status_updated', {
      orderId: order.id,
      status: OrderStatus.COMPLETED,
      clearingEndsAt: clearingEndsAt.toISOString(),
      order: updatedOrder,
    });

    // Realtime notification in DB for vendor
    if (order.vendorProfile?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: order.vendorProfile.userId,
          type: NotificationType.GENERAL,
          title: `Delivery Accepted! Order Completed (#${order.orderNumber})`,
          body: isSystem
            ? `Order #${order.orderNumber} was auto-completed. $${order.vendorNet} has entered 7-day security clearing (Pending for Release).`
            : `Client accepted your delivery! $${order.vendorNet} has entered 7-day security clearing (Pending for Release).`,
          link: `/vendor/orders/${order.id}`,
        },
      }).catch(() => null);
    }

    return {
      success: true,
      message: 'Delivery accepted and order marked completed. 7-day security clearing period has started.',
      order: updatedOrder,
      clearingEndsAt,
    };
  }

  async requestRevision(
    orderId: string,
    clientProfileId?: string,
    dto?: RequestRevisionDto,
    userId?: string,
  ) {
    let resolvedClientProfileId = clientProfileId;
    if (!resolvedClientProfileId && userId) {
      const profile = await this.prisma.clientProfile.findUnique({ where: { userId } });
      if (profile) resolvedClientProfileId = profile.id;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { milestones: true, vendorProfile: true, clientProfile: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (resolvedClientProfileId && order.clientProfileId !== resolvedClientProfileId) {
      throw new ForbiddenException('Unauthorized: Only the client can request a revision');
    }
    if (userId && order.clientProfile?.userId && order.clientProfile.userId !== userId) {
      throw new ForbiddenException('Unauthorized: Only the client can request a revision');
    }

    if (order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot request revision on an already completed order.');
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        `Revision can only be requested on DELIVERED orders. Current status: ${order.status}`,
      );
    }

    const reason = (dto?.reason || '').trim();
    if (!reason || reason.length < 5) {
      throw new BadRequestException(
        'Please provide a detailed reason and instructions for the revision (at least 5 characters).',
      );
    }

    const now = new Date();
    const revisionCount = (order.revisionCount || 0) + 1;
    const revisionNote = `Revision Request #${revisionCount}: ${reason}${dto?.notes ? ` - ${dto.notes.trim()}` : ''}`;

    const prevDeliveries = Array.isArray(order.deliveries) ? (order.deliveries as any[]) : [];
    const updatedDeliveries = [
      ...prevDeliveries,
      {
        type: 'REVISION_REQUEST',
        round: revisionCount,
        reason,
        notes: dto?.notes?.trim() || null,
        requestedAt: now.toISOString(),
      },
    ];

    // Update order status to REVISION_REQUESTED
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.REVISION_REQUESTED,
        revisionReason: reason,
        revisionCount,
        deliveryNotes: revisionNote,
        autoCompleteAt: null, // Cancel auto-complete timer while in revision
        deliveries: updatedDeliveries,
      },
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        clientProfile: true,
        vendorProfile: true,
      },
    });

    // If order has milestones in PENDING_RELEASE, return them to FUNDED
    if (order.milestones.length > 0) {
      await this.prisma.milestone.updateMany({
        where: {
          orderId,
          status: MilestoneStatus.PENDING_RELEASE,
        },
        data: {
          status: MilestoneStatus.FUNDED,
          note: revisionNote,
        },
      });
    }

    // Real-time socket emission
    this.messagesGateway.notifyOrderRoom(order.id, 'order_status_updated', {
      orderId: order.id,
      status: OrderStatus.REVISION_REQUESTED,
      revisionReason: reason,
      revisionCount,
      order: updatedOrder,
    });

    // Notify vendor
    if (order.vendorProfile?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: order.vendorProfile.userId,
          type: NotificationType.GENERAL,
          title: `Revision Requested (#${order.orderNumber})`,
          body: `Client requested changes for Revision #${revisionCount}: "${reason}". Please review and deliver updated work.`,
          link: `/vendor/orders/${order.id}`,
        },
      }).catch(() => null);
    }

    return {
      success: true,
      message: 'Revision requested successfully. Artisan has been notified to re-deliver.',
      order: updatedOrder,
    };
  }

  async declineDelivery(
    orderId: string,
    clientProfileId: string,
    dto: DeclineDeliveryDto,
    userId?: string,
  ) {
    return this.requestRevision(
      orderId,
      clientProfileId,
      { reason: dto.reason, notes: dto.notes },
      userId,
    );
  }

  async processSecurityClearingTransfers() {
    if (this.clearingWorkerRunning) return;
    this.clearingWorkerRunning = true;
    try {
      const now = new Date();
      // Find completed orders where 7-day clearing has elapsed and not yet transferred
      const dueOrders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.COMPLETED,
          clearingEndsAt: { lte: now },
          transferredAt: null,
          stripeTransferId: null,
        },
        include: {
          vendorProfile: true,
          clientProfile: true,
        },
        take: 50,
      });

      for (const order of dueOrders) {
        // Idempotency: skip if already transferred
        if (order.transferredAt || order.stripeTransferId) continue;

        const existingTx = await this.prisma.transaction.findFirst({
          where: { txRef: `TRANSFER-ORDER-${order.id}` },
        });
        if (existingTx) continue;

        const netAmount = Number(order.vendorNet || order.subtotal.mul(0.85));
        const vendorAccountId = order.vendorProfile?.stripeAccountId;
        let stripeTransferId: string | null = null;

        if (vendorAccountId) {
          try {
            const transfer = await this.stripe.transferOrderFunds({
              amount: netAmount,
              vendorStripeAccountId: vendorAccountId,
              orderId: order.id,
              idempotencyKey: `order-connect-release-${order.id}`,
            });
            stripeTransferId = transfer?.id || null;
          } catch (stripeErr: any) {
            console.error(
              `Stripe Connect transfer failed for order ${order.id}:`,
              stripeErr?.message || stripeErr,
            );
          }
        }

        const transferRef = stripeTransferId || `OFFLINE-RELEASE-${Date.now()}`;

        await this.prisma.$transaction(async (tx) => {
          // 1. Update Order
          await tx.order.update({
            where: { id: order.id },
            data: {
              transferredAt: new Date(),
              stripeTransferId: transferRef,
            },
          });

          // 2. Update Vendor Wallet: Move from pendingForRelease to availableAmount & totalEarned
          const wallet = await tx.vendorWallet.findUnique({
            where: { vendorProfileId: order.vendorProfileId },
          });
          if (wallet) {
            await tx.vendorWallet.update({
              where: { id: wallet.id },
              data: {
                pendingForReleaseAmount: {
                  decrement: Math.min(Number(wallet.pendingForReleaseAmount), netAmount),
                },
                availableAmount: { increment: netAmount },
                totalEarned: { increment: netAmount },
              },
            });
          }

          // 3. Update Wallet Ledger Entry
          await tx.walletLedgerEntry.updateMany({
            where: {
              orderId: order.id,
              status: LedgerStatus.CLEARING,
            },
            data: {
              status: LedgerStatus.AVAILABLE,
              description: `7-day security clearing completed. 85% ($${netAmount.toFixed(2)}) transferred to vendor balance.`,
            },
          });

          // 4. Record Transaction
          await tx.transaction.create({
            data: {
              txRef: `TRANSFER-ORDER-${order.id}`,
              orderId: order.id,
              vendorProfileId: order.vendorProfileId,
              clientProfileId: order.clientProfileId,
              type: TransactionType.PAYOUT,
              amount: order.amount || order.grandTotal,
              fee: order.platformFee,
              net: new Prisma.Decimal(netAmount),
              status: PaymentStatus.SUCCEEDED,
              stripeId: transferRef,
              description: `85% payout released for Order #${order.orderNumber} (15% platform fee retained)`,
              metadata: {
                orderId: order.id,
                orderNumber: order.orderNumber,
                stripeTransferId,
                vendorAccountId,
              },
            },
          });
        });

        // Notify vendor
        if (order.vendorProfile?.userId) {
          await this.prisma.notification.create({
            data: {
              userId: order.vendorProfile.userId,
              type: NotificationType.PAYOUT_SENT,
              title: `Funds Available & Transferred (#${order.orderNumber})`,
              body: `$${netAmount.toFixed(2)} (85% net earnings) has cleared the 7-day security hold and transferred to your account balance.`,
              link: `/vendor/earnings`,
            },
          }).catch(() => null);
        }
      }
    } catch (err: any) {
      console.error('Clearing worker encountered an error:', err?.message || err);
    } finally {
      this.clearingWorkerRunning = false;
    }
  }

  async autoCompleteDeliveredOrders() {
    if (this.autoCompleteWorkerRunning) return;
    this.autoCompleteWorkerRunning = true;
    try {
      const now = new Date();
      // Find orders delivered >= 3 days ago with no client action
      const dueOrders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.DELIVERED,
          autoCompleteAt: { lte: now },
        },
        take: 20,
      });

      for (const order of dueOrders) {
        try {
          await this.acceptDelivery(
            order.id,
            order.clientProfileId,
            { note: 'Auto-completed after 3 days without client response' },
            undefined,
            true, // isSystem
          );
        } catch (err: any) {
          console.error(`Auto-complete failed for order ${order.id}:`, err?.message || err);
        }
      }
    } catch (err: any) {
      console.error('Auto-complete worker encountered an error:', err?.message || err);
    } finally {
      this.autoCompleteWorkerRunning = false;
    }
  }

  async createReview(orderId: string, clientProfileId: string, dto: CreateReviewDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.clientProfileId !== clientProfileId) throw new BadRequestException('Unauthorized');
    if (order.status !== OrderStatus.COMPLETED) throw new BadRequestException('Order is not completed');

    const existing = await this.prisma.review.findFirst({
      where: { orderId, clientProfileId },
    });
    if (existing) throw new BadRequestException('Review already submitted');

    const review = await this.prisma.review.create({
      data: {
        orderId,
        gigId: order.gigId,
        clientProfileId,
        vendorProfileId: order.vendorProfileId,
        rating: dto.rating,
        title: dto.title,
        comment: dto.comment,
      },
    });

    // Update vendor aggregate rating
    const agg = await this.prisma.review.aggregate({
      where: { vendorProfileId: order.vendorProfileId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.vendorProfile.update({
      where: { id: order.vendorProfileId },
      data: {
        rating: agg._avg.rating || 0,
        reviewCount: agg._count.rating,
      },
    });

    return review;
  }

  async getPaymentLedger(clientProfileId: string) {
    const orders = await this.prisma.order.findMany({
      where: { clientProfileId },
      include: {
        milestones: true,
        transactions: true,
        vendorProfile: { select: { businessName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const escrowTotal = orders
      .filter((o) => [OrderStatus.ACTIVE, OrderStatus.IN_PROGRESS].includes(o.status as any))
      .reduce((sum, o) => sum + Number(o.grandTotal), 0);

    return { orders, escrowTotal };
  }

  async createDispute(orderId: string, clientProfileId: string, dto: CreateDisputeDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { vendorProfile: true, gig: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.clientProfileId !== clientProfileId) throw new BadRequestException('Unauthorized');

    const dispute = await this.prisma.dispute.create({
      data: {
        orderId,
        clientProfileId,
        vendorProfileId: order.vendorProfileId,
        reason: dto.reason,
        description: dto.description,
        evidence: dto.evidence || undefined,
        status: DisputeStatus.OPEN,
      },
      include: {
        vendorProfile: true,
        order: { include: { gig: true } },
      },
    });

    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.DISPUTED } });

    return dispute;
  }

  async getClientDisputes(clientProfileId: string) {
    const disputes = await this.prisma.dispute.findMany({
      where: { clientProfileId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            grandTotal: true,
            gig: { select: { title: true } },
          },
        },
        vendorProfile: {
          select: {
            id: true,
            businessName: true,
            avatarUrl: true,
            user: { select: { email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return disputes.map((d: any) => ({
      id: d.id,
      disputeNumber: `DISP-${d.id.slice(-6).toUpperCase()}`,
      orderId: d.order?.orderNumber || d.orderId,
      vendorName: d.vendorProfile?.businessName || 'Assigned Vendor',
      serviceTitle: d.order?.gig?.title || 'Event Milestone Resolution',
      amountInCustody: Number(d.order?.grandTotal || 0),
      reason: d.reason,
      status: d.status === DisputeStatus.OPEN ? 'Vendor Response Pending' : d.status === DisputeStatus.UNDER_REVIEW ? 'Under Mediation' : d.status === DisputeStatus.RESOLVED_CLIENT ? 'Resolved - Refunded' : 'Closed',
      openedDate: new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      timerHoursLeft: 48,
      assignedMediator: 'Ophir Trust Desk',
    }));
  }

  async getVendorDisputes(vendorProfileId: string) {
    const disputes = await this.prisma.dispute.findMany({
      where: { vendorProfileId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            grandTotal: true,
            status: true,
            gig: { select: { title: true } },
            package: { select: { title: true } },
          },
        },
        clientProfile: {
          select: {
            displayName: true,
            avatarUrl: true,
            user: { select: { email: true } },
          },
        },
        disputeMessages: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return disputes.map((d: any) => ({
      id: d.id,
      disputeNumber: `DISP-${d.id.slice(-6).toUpperCase()}`,
      orderId: d.order?.orderNumber || d.orderId,
      orderEntityId: d.orderId,
      clientName: d.clientProfile?.displayName || 'Client Host',
      clientAvatar: d.clientProfile?.avatarUrl,
      clientEmail: d.clientProfile?.user?.email,
      serviceTitle: d.order?.gig?.title || d.order?.package?.title || 'Celebration Milestone Order',
      amountInCustody: Number(d.order?.grandTotal || 0),
      reason: d.reason,
      status: d.status,
      evidence: d.evidence,
      resolution: d.resolution,
      resolvedAt: d.resolvedAt,
      openedDate: new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      createdAt: d.createdAt,
      messages: d.disputeMessages || [],
    }));
  }

  async respondToDispute(
    disputeId: string,
    vendorProfileId: string,
    dto: RespondDisputeDto,
    userId: string,
  ) {
    const dispute = await this.prisma.dispute.findFirst({
      where: { id: disputeId, vendorProfileId },
      include: { clientProfile: true, order: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found or unauthorized');

    if (
      ([DisputeStatus.RESOLVED_CLIENT, DisputeStatus.RESOLVED_VENDOR, DisputeStatus.CLOSED] as DisputeStatus[]).includes(dispute.status)
    ) {
      throw new BadRequestException('This dispute is already resolved or closed');
    }

    await this.prisma.disputeMessage.create({
      data: {
        disputeId: dispute.id,
        senderId: userId,
        senderRole: Role.VENDOR,
        content: dto.responseText,
        attachments: dto.attachments || [],
      },
    });

    const updated = await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: DisputeStatus.UNDER_REVIEW,
        updatedAt: new Date(),
      },
      include: {
        disputeMessages: { orderBy: { createdAt: 'asc' } },
        order: { select: { orderNumber: true, grandTotal: true } },
        clientProfile: { select: { displayName: true } },
      },
    });

    if (dispute.clientProfile?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: dispute.clientProfile.userId,
          type: NotificationType.GENERAL,
          title: `Vendor responded to Dispute #${dispute.id.slice(-6).toUpperCase()}`,
          body: `The vendor submitted their statement/evidence for order #${dispute.order.orderNumber}. The case is now under mediation review.`,
          link: `/user/disputes`,
        },
      }).catch(() => null);
    }

    return updated;
  }

  async acceptDisputeRefund(disputeId: string, vendorProfileId: string) {
    const dispute = await this.prisma.dispute.findFirst({
      where: { id: disputeId, vendorProfileId },
      include: { clientProfile: true, order: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found or unauthorized');

    if (
      !([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] as DisputeStatus[]).includes(dispute.status)
    ) {
      throw new BadRequestException('Dispute is not active');
    }

    const updated = await this.prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: DisputeStatus.RESOLVED_CLIENT,
        resolution: 'Vendor accepted full dispute resolution and authorized client escrow refund.',
        resolvedAt: new Date(),
      },
    });

    await this.prisma.order.update({
      where: { id: dispute.orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    if (dispute.clientProfile?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: dispute.clientProfile.userId,
          type: NotificationType.GENERAL,
          title: `Dispute Resolution Accepted (#${dispute.id.slice(-6).toUpperCase()})`,
          body: `The vendor accepted your dispute. Escrow funds will be returned to your original payment method.`,
          link: `/user/disputes`,
        },
      }).catch(() => null);
    }

    return updated;
  }

  async cancelOrder(
    orderId: string,
    clientProfileId?: string,
    dto?: CancelOrderDto,
    userId?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        clientProfile: true,
        vendorProfile: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    // Authorize client
    let authorized = false;
    if (clientProfileId && order.clientProfileId === clientProfileId) {
      authorized = true;
    } else if (userId && order.clientProfile?.userId === userId) {
      authorized = true;
    } else if (userId) {
      const userProfile = await this.prisma.clientProfile.findUnique({ where: { userId } });
      if (userProfile && userProfile.id === order.clientProfileId) authorized = true;
    }

    if (!authorized) {
      throw new ForbiddenException('You do not have permission to cancel this order');
    }

    // Check delivered / completed
    if (order.status === OrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel an order that has already been delivered and completed.');
    }


    // Identify milestones
    const releasedMilestones = order.milestones.filter(
      (m) => m.status === MilestoneStatus.RELEASED
    );
    const unreleasedMilestones = order.milestones.filter(
      (m) => m.status !== MilestoneStatus.RELEASED
    );

    // Stop any scheduled transfer before attempting Stripe refunds.
    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        deliveryNotes: dto?.reason
          ? `${order.deliveryNotes || ''} | Cancellation: ${dto.reason}${dto?.notes ? ` - ${dto.notes}` : ''}`
          : order.deliveryNotes,
      },
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
      },
    });

    const refundResults: Array<{ milestoneId: string; status: 'REFUNDED' | 'FAILED' }> = [];
    for (const milestone of unreleasedMilestones) {
      if (!milestone.stripePaymentIntentId) {
        await this.prisma.milestone.update({
          where: { id: milestone.id },
          data: { status: MilestoneStatus.REFUNDED, note: 'Cancelled before this milestone was paid.' },
        });
        refundResults.push({ milestoneId: milestone.id, status: 'REFUNDED' });
        continue;
      }

      try {
        const paymentIntent = await this.stripe.retrievePaymentIntent(milestone.stripePaymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
          if (paymentIntent.status === 'canceled') {
            await this.prisma.milestone.update({
              where: { id: milestone.id },
              data: { status: MilestoneStatus.REFUNDED, note: 'Payment was cancelled before funds were captured.' },
            });
            refundResults.push({ milestoneId: milestone.id, status: 'REFUNDED' });
            continue;
          }
          if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(paymentIntent.status)) {
            await this.stripe.cancelPaymentIntent(paymentIntent.id);
            await this.prisma.milestone.update({
              where: { id: milestone.id },
              data: { status: MilestoneStatus.REFUNDED, note: 'Payment was cancelled before capture.' },
            });
            refundResults.push({ milestoneId: milestone.id, status: 'REFUNDED' });
            continue;
          }
          throw new Error(`Payment is ${paymentIntent.status}; Stripe has not confirmed a refundable charge yet`);
        }
        const refund = await this.stripe.createRefund({
          paymentIntentId: milestone.stripePaymentIntentId,
          idempotencyKey: `cancel-${order.id}-${milestone.id}`,
        });
        await this.prisma.$transaction(async (tx) => {
          await tx.milestone.update({
            where: { id: milestone.id },
            data: { status: MilestoneStatus.REFUNDED, note: `Refunded on cancellation (${refund.id}).` },
          });
          await tx.earning.updateMany({ where: { milestoneId: milestone.id }, data: { status: 'refunded' } });
          await tx.transaction.upsert({
            where: { txRef: `REFUND-${refund.id}` },
            create: {
              txRef: `REFUND-${refund.id}`,
              orderId: order.id,
              clientProfileId: order.clientProfileId,
              vendorProfileId: order.vendorProfileId,
              type: TransactionType.REFUND,
              amount: Number(milestone.amount),
              fee: 0,
              net: Number(milestone.amount),
              status: PaymentStatus.SUCCEEDED,
              stripeId: refund.id,
              description: `Cancellation refund: ${milestone.label}`,
              metadata: { milestoneId: milestone.id },
            },
            update: { status: PaymentStatus.SUCCEEDED },
          });
        });
        refundResults.push({ milestoneId: milestone.id, status: 'REFUNDED' });
      } catch (error: any) {
        await this.prisma.transaction.create({
          data: {
            txRef: `REFUND-FAILED-${milestone.id}`,
            orderId: order.id,
            clientProfileId: order.clientProfileId,
            vendorProfileId: order.vendorProfileId,
            type: TransactionType.REFUND,
            amount: milestone.amount,
            fee: 0,
            net: 0,
            status: PaymentStatus.FAILED,
            stripeId: milestone.stripePaymentIntentId,
            description: `Cancellation refund failed for ${milestone.label}: ${error?.message || 'Stripe error'}`,
            metadata: { milestoneId: milestone.id },
          },
        }).catch(() => null);
        refundResults.push({ milestoneId: milestone.id, status: 'FAILED' });
      }
    }

    // Notify vendor
    if (order.vendorProfile?.userId) {
      const refundSum = refundResults.filter((item) => item.status === 'REFUNDED').reduce((acc, item) => {
        const milestone = unreleasedMilestones.find((candidate) => candidate.id === item.milestoneId);
        return acc + Number(milestone?.amount || 0);
      }, 0);
      const releasedSum = releasedMilestones.reduce((acc, m) => acc + Number(m.amount), 0);
      await this.prisma.notification.create({
        data: {
          userId: order.vendorProfile.userId,
          type: NotificationType.GENERAL,
          title: `Order Cancelled (#${order.orderNumber})`,
          body: `Client requested cancellation for order #${order.orderNumber}.${
            releasedMilestones.length > 0
              ? ` ${releasedMilestones.length} completed milestone(s) ($${releasedSum.toFixed(2)}) remain credited to your balance. `
              : ' '
          }${refundResults.filter((item) => item.status === 'REFUNDED').length} milestone(s) ($${refundSum.toFixed(2)}) refunded; ${refundResults.filter((item) => item.status === 'FAILED').length} refund(s) need follow-up. Reason: ${dto?.reason || 'Client cancellation'}.`,
          link: `/vendor/orders`,
        },
      }).catch(() => null);
    }

    return {
      success: true,
      message: 'Order cancelled successfully',
      order: updatedOrder,
      completedMilestonesCount: releasedMilestones.length,
      refundedMilestonesCount: refundResults.filter((item) => item.status === 'REFUNDED').length,
      failedRefundMilestones: refundResults.filter((item) => item.status === 'FAILED').map((item) => item.milestoneId),
    };
  }
}



