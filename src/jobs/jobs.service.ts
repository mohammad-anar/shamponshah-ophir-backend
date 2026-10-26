import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateJobDto, UpdateJobDto, CreateOfferDto, JobQueryDto, AcceptOfferDto } from './dto/job.dto';
import {
  JobStatus,
  OfferStatus,
  OrderStatus,
  MilestoneStatus,
  NotificationType,
  Prisma,
  OrderSource,
  LedgerStatus,
  LedgerEntryType,
  TransactionType,
  PaymentStatus,
} from '@prisma/client';
import { StripeService } from '../stripe/stripe.service';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly stripe: StripeService,
  ) {}

  // ── CLIENT: Post a Job ─────────────────────────────────────

  async createJob(clientProfileId: string, dto: CreateJobDto, userId?: string) {
    let resolvedClientProfileId = clientProfileId;
    if (!resolvedClientProfileId && userId) {
      let profile = await this.prisma.clientProfile.findUnique({
        where: { userId },
      });
      if (!profile) {
        profile = await this.prisma.clientProfile.create({
          data: { userId, displayName: 'Client' },
        });
      }
      resolvedClientProfileId = profile.id;
    }
    if (!resolvedClientProfileId) {
      throw new BadRequestException('Client profile not found. Please log in as a client.');
    }

    let categoryId = dto.categoryId;
    if (categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!cat || !cat.isActive) {
        throw new BadRequestException('Selected category does not exist or is inactive.');
      }
    } else if (dto.category) {
      const cat = await this.prisma.category.findFirst({
        where: {
          isActive: true,
          OR: [
            { id: dto.category },
            { name: { contains: dto.category, mode: 'insensitive' } },
            { slug: { contains: dto.category.toLowerCase().replace(/[^a-z0-9]/g, '-'), mode: 'insensitive' } },
          ],
        },
      });
      if (cat) categoryId = cat.id;
    }

    const { category, publishNow, eventDate: rawEventDate, ...rest } = dto;
    const status = publishNow ? JobStatus.OPEN : JobStatus.DRAFT;

    let parsedEventDate: Date | null = null;
    if (rawEventDate) {
      const d = new Date(rawEventDate);
      if (!isNaN(d.getTime())) {
        parsedEventDate = d;
      }
    }

    return this.prisma.job.create({
      data: {
        ...rest,
        eventDate: parsedEventDate,
        categoryId: categoryId || undefined,
        clientProfileId: resolvedClientProfileId,
        status,
        isPostedToFamily: dto.isPostedToFamily ?? false,
      },
    });
  }

  async publishJob(jobId: string, clientProfileId: string) {
    const job = await this.assertJobOwner(jobId, clientProfileId);
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.OPEN },
    });
  }

  async getClientJobs(clientProfileId?: string, status?: string, userId?: string) {
    let resolvedClientProfileId = clientProfileId;
    if (!resolvedClientProfileId && userId) {
      const client = await this.prisma.clientProfile.findUnique({ where: { userId } });
      resolvedClientProfileId = client?.id;
    }

    const whereClause: any = resolvedClientProfileId ? { clientProfileId: resolvedClientProfileId } : {};
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }

    return this.prisma.job.findMany({
      where: whereClause,
      include: {
        category: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            grandTotal: true,
          },
        },
        offers: {
          include: {
            vendorProfile: {
              select: {
                id: true,
                businessName: true,
                rating: true,
                avatarUrl: true,
                tier: true,
                city: true,
                state: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { offers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJobById(jobId: string, requesterId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        category: true,
        subCategory: true,
        offers: {
          include: {
            vendorProfile: {
              select: { businessName: true, slug: true, rating: true, tier: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async getJobOffers(jobId: string, clientProfileId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        category: true,
        offers: {
          include: {
            vendorProfile: {
              select: {
                id: true,
                businessName: true,
                slug: true,
                avatarUrl: true,
                city: true,
                state: true,
                tier: true,
                rating: true,
                reviewCount: true,
                identityVerified: true,
                responseSpeed: true,
                tagline: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.clientProfileId !== clientProfileId) {
      throw new ForbiddenException('You do not have permission to view offers for this job');
    }

    return {
      job: {
        id: job.id,
        title: job.title,
        description: job.description,
        occasion: job.occasion,
        category: job.category?.name,
        budgetMin: job.budgetMin,
        budgetMax: job.budgetMax,
        location: job.location,
        eventDate: job.eventDate,
      },
      offers: job.offers.map((offer, idx) => {
        const basePrice = Number(offer.price || 0);
        const escrowFee = Number((basePrice * 0.05).toFixed(2));
        const totalPay = Number((basePrice + escrowFee).toFixed(2));

        return {
          id: offer.id,
          vendorName: offer.vendorProfile?.businessName || 'Verified Artisan',
          vendorSlug: offer.vendorProfile?.slug || offer.vendorProfileId,
          avatarUrl: offer.vendorProfile?.avatarUrl,
          location: offer.vendorProfile?.city
            ? `${offer.vendorProfile.city}, ${offer.vendorProfile.state || 'IL'}`
            : 'Chicago, IL',
          tier: offer.vendorProfile?.tier || 'PRO',
          rating: offer.vendorProfile?.rating ? Number(offer.vendorProfile.rating).toFixed(1) : '5.0',
          reviewCount: offer.vendorProfile?.reviewCount || 12,
          identityVerified: offer.vendorProfile?.identityVerified ?? true,
          basePrice,
          escrowFee,
          totalPay,
          message: offer.message,
          deliverables: offer.deliverables || 'Full celebration service & on-site delivery',
          estimatedHours: offer.estimatedHours || '4-5 Hours Event Coverage',
          escrowSplit: offer.escrowSplitJson || { deposit: '50%', completion: '50%' },
          status: offer.status,
          createdAt: offer.createdAt,
          bestValue: idx === 0,
        };
      }),
    };
  }

  async updateJob(jobId: string, clientProfileId?: string, dto?: UpdateJobDto, userId?: string) {
    const job = await this.assertJobOwner(jobId, clientProfileId, userId);

    // If an offer has already been accepted or job is awarded, disallow major edits
    const acceptedOffer = await this.prisma.offer.findFirst({
      where: { jobId, status: OfferStatus.ACCEPTED },
    });
    if (acceptedOffer || job.status === JobStatus.AWARDED) {
      throw new BadRequestException('Cannot edit a job after an offer has been accepted and awarded.');
    }

    let categoryId = dto?.categoryId;
    if (!categoryId && dto?.category) {
      const cat = await this.prisma.category.findFirst({
        where: {
          OR: [
            { name: { contains: dto.category, mode: 'insensitive' } },
            { slug: { contains: dto.category.toLowerCase().replace(/[^a-z0-9]/g, '-'), mode: 'insensitive' } },
          ],
        },
      });
      if (cat) categoryId = cat.id;
    }

    const { category, publishNow, eventDate: rawEventDate, ...data } = (dto || {}) as any;
    let parsedEventDate: Date | undefined = undefined;
    if (rawEventDate) {
      const d = new Date(rawEventDate);
      if (!isNaN(d.getTime())) {
        parsedEventDate = d;
      }
    }

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        ...data,
        ...(categoryId && { categoryId }),
        ...(parsedEventDate !== undefined && { eventDate: parsedEventDate }),
        ...(publishNow !== undefined && { status: publishNow ? JobStatus.OPEN : JobStatus.DRAFT }),
      },
      include: { category: true, offers: true },
    });
  }

  async deleteJob(jobId: string, clientProfileId?: string, userId?: string) {
    const job = await this.assertJobOwner(jobId, clientProfileId, userId);

    // If an offer has already been accepted or job is awarded, delete is strictly blocked
    const acceptedOffer = await this.prisma.offer.findFirst({
      where: { jobId, status: OfferStatus.ACCEPTED },
    });
    if (acceptedOffer || job.status === JobStatus.AWARDED) {
      throw new BadRequestException('Cannot delete job because an offer has already been accepted and awarded.');
    }

    // Delete all offers for this job
    await this.prisma.offer.deleteMany({
      where: { jobId },
    });

    // Delete the job
    await this.prisma.job.delete({
      where: { id: jobId },
    });

    return {
      success: true,
      message: 'Job deleted successfully',
      id: jobId,
    };
  }

  async cancelJob(jobId: string, clientProfileId?: string, userId?: string) {
    const job = await this.assertJobOwner(jobId, clientProfileId, userId);

    // If an offer has already been accepted or job is awarded, cancel is not allowed directly
    const acceptedOffer = await this.prisma.offer.findFirst({
      where: { jobId, status: OfferStatus.ACCEPTED },
    });
    if (acceptedOffer || job.status === JobStatus.AWARDED) {
      throw new BadRequestException('Cannot cancel job because an offer has already been accepted and awarded.');
    }

    // Find any pending offers submitted by vendors
    const pendingOffers = await this.prisma.offer.findMany({
      where: { jobId, status: OfferStatus.PENDING },
      include: { vendorProfile: true },
    });

    // Close all pending offers for this job
    await this.prisma.offer.updateMany({
      where: { jobId, status: OfferStatus.PENDING },
      data: { status: OfferStatus.WITHDRAWN },
    });

    // Update job status to CANCELLED
    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.CANCELLED },
    });

    // Notify vendors who had submitted pending bids
    for (const offer of pendingOffers) {
      if (offer.vendorProfile?.userId) {
        try {
          await this.notifications.createNotification({
            userId: offer.vendorProfile.userId,
            type: NotificationType.GENERAL,
            title: 'Job RFP Cancelled',
            body: `The client cancelled the RFP "${job.title}". Your submitted proposal has been closed.`,
            link: `/vendor/offers`,
          });
        } catch (_) {}
      }
    }

    return {
      success: true,
      message: 'Job RFP cancelled successfully',
      id: jobId,
      job: updatedJob,
    };
  }

  async acceptOffer(
    jobId: string,
    offerId: string,
    clientProfileId?: string,
    userId?: string,
    paymentMethodId?: string,
  ) {
    const job = await this.assertJobOwner(jobId, clientProfileId, userId);
    if (job.status !== JobStatus.OPEN && job.status !== JobStatus.AWARDED) {
      throw new BadRequestException('Job is not open for offers');
    }

    const offer = await this.prisma.offer.findFirst({
      where: { id: offerId, jobId },
      include: { vendorProfile: true },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException(`Offer is already ${offer.status.toLowerCase()}`);
    }

    // Resolve client profile
    let resolvedClientProfileId = clientProfileId || job.clientProfileId;
    let client = await this.prisma.clientProfile.findUnique({
      where: { id: resolvedClientProfileId },
      include: { user: true },
    });
    if (!client && userId) {
      client = await this.prisma.clientProfile.findUnique({
        where: { userId },
        include: { user: true },
      });
      if (client) resolvedClientProfileId = client.id;
    }
    if (!client) throw new NotFoundException('Client profile not found');

    // ── Check client's saved payment method ──
    const savedCard = paymentMethodId
      ? await this.prisma.paymentMethod.findFirst({
          where: { clientProfileId: client.id, stripePaymentMethodId: paymentMethodId },
        })
      : (await this.prisma.paymentMethod.findFirst({
          where: { clientProfileId: client.id, isDefault: true },
        })) ||
        (await this.prisma.paymentMethod.findFirst({
          where: { clientProfileId: client.id },
          orderBy: { createdAt: 'desc' },
        }));

    if (!savedCard || !savedCard.stripePaymentMethodId) {
      throw new BadRequestException(
        'Please add a saved payment method to your account before accepting an offer. Your card will be charged immediately upon accepting the offer.',
      );
    }

    let customerId = client.stripeCustomerId;
    if (!customerId) {
      const stripeCustomer = await this.stripe.createCustomer(
        client.user?.email || 'client@ophir.local',
        client.displayName,
      );
      customerId = stripeCustomer.id;
      await this.prisma.clientProfile.update({
        where: { id: client.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // ── Amount & Fee Calculation (15% platform fee, 85% vendor net) ──
    const subtotal = new Prisma.Decimal(offer.price);
    const platformFee = subtotal.mul(0.15).toDecimalPlaces(2);
    const vendorNet = subtotal.mul(0.85).toDecimalPlaces(2);
    const grandTotal = subtotal.add(platformFee);
    const orderNumber = `JB-${Date.now().toString().slice(-6)}`;

    // ── Off-session Stripe Charge ──
    let pi: any;
    try {
      pi = await this.stripe.createOffSessionOrderPaymentIntent({
        amount: Number(grandTotal),
        customerId,
        paymentMethodId: savedCard.stripePaymentMethodId,
        transferGroup: orderNumber,
        metadata: {
          jobId,
          offerId,
          clientId: client.id,
          vendorProfileId: offer.vendorProfileId,
          orderNumber,
          type: 'JOB_OFFER_ESCROW',
        },
        idempotencyKey: `accept-job-${jobId}-offer-${offerId}`,
      });
    } catch (err: any) {
      // Payment failure must NOT accept offer and must display explicit error
      throw new BadRequestException(
        `Payment failed: ${err.message || 'Card declined'}. Your card was not charged and the offer was not accepted. Please check your card or add another payment method.`,
      );
    }

    if (pi.status !== 'succeeded') {
      throw new BadRequestException(
        `Payment could not be completed off-session (Stripe status: ${pi.status}). The offer was not accepted.`,
      );
    }

    // ── Charge Succeeded: Atomic Transition ──
    const newOrder = await this.prisma.$transaction(async (tx) => {
      // 1. Accepted offer
      await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.ACCEPTED },
      });

      // 2. All remaining offers marked NOT_SELECTED
      await tx.offer.updateMany({
        where: { jobId, id: { not: offerId } },
        data: { status: OfferStatus.NOT_SELECTED },
      });

      // 3. Job marked CLOSED
      await tx.job.update({
        where: { id: jobId },
        data: { status: JobStatus.CLOSED },
      });

      // 4. Create Order: status ACTIVE, paymentStatus VAULT_HELD
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          clientProfileId: client!.id,
          vendorProfileId: offer.vendorProfileId,
          source: OrderSource.JOB,
          jobId,
          offerId,
          subtotal,
          platformFee,
          vendorNet,
          amount: grandTotal,
          grandTotal,
          status: OrderStatus.ACTIVE,
          paymentStatus: PaymentStatus.VAULT_HELD,
          stripePaymentIntentId: pi.id,
          paidAt: new Date(),
          deliveryNotes: `Custom engagement for: ${job.title}`,
          eventDate: job.eventDate,
        },
      });

      // 5. Vendor Wallet: increment pendingAmount (active order running)
      let wallet = await tx.vendorWallet.findUnique({
        where: { vendorProfileId: offer.vendorProfileId },
      });
      if (!wallet) {
        wallet = await tx.vendorWallet.create({
          data: { vendorProfileId: offer.vendorProfileId },
        });
      }

      await tx.vendorWallet.update({
        where: { id: wallet.id },
        data: {
          pendingAmount: { increment: vendorNet },
        },
      });

      // 6. Wallet Ledger Entry
      await tx.walletLedgerEntry.create({
        data: {
          walletId: wallet.id,
          vendorProfileId: offer.vendorProfileId,
          orderId: createdOrder.id,
          type: LedgerEntryType.ORDER_PAYMENT,
          gross: grandTotal,
          platformFee,
          vendorNet,
          status: LedgerStatus.PENDING,
          description: `Escrow vault hold for Job Offer #${orderNumber} (${job.title})`,
        },
      });

      // 7. Transaction record
      await tx.transaction.create({
        data: {
          txRef: `ESCROW-JOB-${pi.id}`,
          orderId: createdOrder.id,
          clientProfileId: client!.id,
          vendorProfileId: offer.vendorProfileId,
          type: TransactionType.ESCROW_DEPOSIT,
          amount: grandTotal,
          fee: platformFee,
          net: vendorNet,
          status: PaymentStatus.SUCCEEDED,
          stripeId: pi.id,
          description: `Off-session escrow payment for Job #${orderNumber}`,
        },
      });

      return createdOrder;
    });

    // ── Notifications ──
    try {
      if (offer.vendorProfile?.userId) {
        await this.notifications.createNotification({
          userId: offer.vendorProfile.userId,
          type: NotificationType.OFFER_ACCEPTED,
          title: 'Offer Accepted & Funded!',
          body: `Congratulations! Your proposal for "${job.title}" was accepted and $${vendorNet.toFixed(2)} is secured in platform escrow. Order #${newOrder.orderNumber} is now ACTIVE.`,
          link: `/vendor/orders/${newOrder.id}`,
        });
      }

      // Notify unselected vendors
      const otherOffers = await this.prisma.offer.findMany({
        where: { jobId, id: { not: offerId } },
        include: { vendorProfile: true },
      });
      for (const other of otherOffers) {
        if (other.vendorProfile?.userId) {
          await this.notifications.createNotification({
            userId: other.vendorProfile.userId,
            type: NotificationType.GENERAL,
            title: 'Job RFP Update',
            body: `Another vendor proposal was accepted for "${job.title}". Thank you for your submission.`,
            link: `/vendor/offers`,
          });
        }
      }
    } catch (_) {}

    return {
      success: true,
      message: 'Offer accepted, client card charged off-session, funds held in escrow vault, and order is active.',
      offerId,
      jobId,
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      status: OrderStatus.ACTIVE,
      amount: Number(grandTotal),
      vendorNet: Number(vendorNet),
    };
  }

  // ── VENDOR: Browse + Submit Offers ─────────────────────────

  async findOpenJobs(query: JobQueryDto, vendorProfileId?: string, userId?: string) {
    const { page = 1, limit = 10, search, categoryId, excludeOffered } = query;
    const skip = (page - 1) * limit;

    let vProfileId = vendorProfileId;
    if (!vProfileId && userId) {
      const v = await this.prisma.vendorProfile.findFirst({ where: { userId } });
      vProfileId = v?.id;
    }

    const where: any = { status: JobStatus.OPEN };
    if (categoryId) where.categoryId = categoryId;
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { occasion: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
    ];

    const shouldExcludeOffered = excludeOffered === true || excludeOffered === 'true';
    if (shouldExcludeOffered && vProfileId) {
      where.offers = {
        none: {
          vendorProfileId: vProfileId,
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          clientProfile: {
            select: {
              displayName: true,
              avatarUrl: true,
              city: true,
              user: { select: { email: true } },
            },
          },
          offers: vProfileId
            ? {
                where: { vendorProfileId: vProfileId },
                select: { id: true, status: true, price: true, createdAt: true, message: true },
              }
            : false,
          _count: { select: { offers: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.job.count({ where }),
    ]);

    const formattedJobs = data.map((job: any) => ({
      ...job,
      bidsSent: job._count?.offers || 0,
      hasSubmittedOffer: Boolean(job.offers && job.offers.length > 0),
      myOffer: job.offers?.[0] || null,
    }));

    return { data: formattedJobs, jobs: formattedJobs, total, page, limit };
  }

  async submitOffer(jobId: string, vendorProfileId?: string, dto?: CreateOfferDto, userId?: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { clientProfile: { select: { userId: true } } },
    });
    if (!job || job.status !== JobStatus.OPEN) throw new BadRequestException('Job is not accepting offers');

    let vendor = await this.prisma.vendorProfile.findFirst({
      where: vendorProfileId ? { id: vendorProfileId } : { userId },
    });
    if (!vendor) throw new BadRequestException('Vendor profile not found');
    const resolvedVendorId = vendor.id;

    const existing = await this.prisma.offer.findFirst({
      where: { jobId, vendorProfileId: resolvedVendorId, status: OfferStatus.PENDING },
    });
    if (existing) throw new BadRequestException('You have already submitted an offer for this job');

    const { coverLetter, message, ...restDto } = dto || ({} as any);
    const finalMessage = message || coverLetter || 'Custom proposal';

    const offer = await this.prisma.offer.create({
      data: {
        ...restDto,
        price: new Prisma.Decimal(dto.price),
        message: finalMessage,
        jobId,
        vendorProfileId: resolvedVendorId,
        bidCreditUsed: 0,
      },
    });

    // Send notification to job owner client
    if (job.clientProfile?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: job.clientProfile.userId,
          type: NotificationType.OFFER_RECEIVED,
          title: `New Proposal Received for "${job.title}"`,
          body: `${vendor.businessName || 'An artisan'} submitted a proposal for $${dto.price}.`,
          link: `/user/jobs`,
        },
      }).catch(() => null);
    }

    return offer;
  }

  async getVendorOffers(vendorProfileId: string) {
    return this.prisma.offer.findMany({
      where: { vendorProfileId },
      include: {
        job: {
          include: { clientProfile: { select: { displayName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async withdrawOffer(offerId: string, vendorProfileId: string) {
    const offer = await this.prisma.offer.findFirst({ where: { id: offerId, vendorProfileId } });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.status !== OfferStatus.PENDING) throw new BadRequestException('Offer cannot be withdrawn');

    const [updated] = await Promise.all([
      this.prisma.offer.update({ where: { id: offerId }, data: { status: OfferStatus.WITHDRAWN } }),
      this.prisma.vendorProfile.update({
        where: { id: vendorProfileId },
        data: { bidCredits: { increment: offer.bidCreditUsed || 2 } },
      }),
    ]);

    return updated;
  }

  // ── Private ─────────────────────────────────────────────────

  private async assertJobOwner(jobId: string, clientProfileId?: string, userId?: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { clientProfile: true },
    });
    if (!job) throw new NotFoundException('Job not found');

    const matchesClient = clientProfileId && job.clientProfileId === clientProfileId;
    const matchesUser = userId && job.clientProfile?.userId === userId;

    if (!matchesClient && !matchesUser) {
      throw new ForbiddenException('You do not have permission to modify this job');
    }
    return job;
  }
}
