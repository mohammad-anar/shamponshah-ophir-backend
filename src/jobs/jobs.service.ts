import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateJobDto, UpdateJobDto, CreateOfferDto, JobQueryDto } from './dto/job.dto';
import { JobStatus, OfferStatus, OrderStatus, MilestoneStatus, NotificationType, Prisma } from '@prisma/client';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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
    if (!categoryId && dto.category) {
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
    if (!categoryId) {
      const firstCat = await this.prisma.category.findFirst();
      if (firstCat) categoryId = firstCat.id;
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

  async acceptOffer(jobId: string, offerId: string, clientProfileId?: string, userId?: string) {
    const job = await this.assertJobOwner(jobId, clientProfileId, userId);
    if (job.status !== JobStatus.OPEN && job.status !== JobStatus.AWARDED) {
      throw new BadRequestException('Job is not open for offers');
    }

    const offer = await this.prisma.offer.findFirst({
      where: { id: offerId, jobId },
      include: { vendorProfile: true },
    });
    if (!offer) throw new NotFoundException('Offer not found');

    // 1. Accept selected offer, decline / reject all other offers for this job
    await this.prisma.$transaction([
      this.prisma.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.ACCEPTED },
      }),
      this.prisma.offer.updateMany({
        where: { jobId, id: { not: offerId } },
        data: { status: OfferStatus.REJECTED },
      }),
      this.prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.AWARDED },
      }),
    ]);

    // 2. Automatically generate an active escrow order if one does not already exist
    const existingOrder = await this.prisma.order.findFirst({
      where: { offerId },
    });

    if (!existingOrder) {
      const subtotal = new Prisma.Decimal(offer.price);
      const platformFee = subtotal.mul(0.05).toDecimalPlaces(2);
      const grandTotal = subtotal.add(platformFee);
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

      const newOrder = await this.prisma.order.create({
        data: {
          orderNumber,
          clientProfileId: clientProfileId || job.clientProfileId,
          vendorProfileId: offer.vendorProfileId,
          jobId,
          offerId,
          subtotal,
          platformFee,
          grandTotal,
          status: OrderStatus.PENDING_PAYMENT,
          deliveryNotes: `Custom engagement for: ${job.title}`,
          eventDate: job.eventDate,
        },
      });

      // Generate milestones based on vendor offer structure (Full Payment vs Staged Milestones)
      let milestoneData: any[] = [];
      const splitJson: any = offer.escrowSplitJson;

      if (splitJson && splitJson.type === 'FULL') {
        milestoneData = [
          {
            orderId: newOrder.id,
            label: splitJson.milestones?.[0]?.label || 'Full Project Payment (100%)',
            percentage: 100,
            amount: subtotal,
            sortOrder: 1,
            status: MilestoneStatus.LOCKED,
            note: splitJson.milestones?.[0]?.note || 'Full payment held in Ophir Vault Escrow. Released upon final delivery and project completion.',
          },
        ];
      } else if (splitJson && splitJson.type === 'MILESTONE' && Array.isArray(splitJson.milestones) && splitJson.milestones.length > 0) {
        let runningAmount = new Prisma.Decimal(0);
        milestoneData = splitJson.milestones.map((m: any, idx: number) => {
          const isLast = idx === splitJson.milestones.length - 1;
          const pct = Number(m.percentage) || Math.round(100 / splitJson.milestones.length);
          let amt: Prisma.Decimal;
          if (isLast) {
            amt = subtotal.sub(runningAmount);
          } else {
            amt = m.amount ? new Prisma.Decimal(m.amount).toDecimalPlaces(2) : subtotal.mul(pct / 100).toDecimalPlaces(2);
            runningAmount = runningAmount.add(amt);
          }
          return {
            orderId: newOrder.id,
            label: m.label || `Milestone ${idx + 1}`,
            percentage: pct,
            amount: amt,
            sortOrder: idx + 1,
            status: MilestoneStatus.LOCKED,
            note: m.note || `Milestone ${idx + 1} held in Ophir Vault Escrow.`,
          };
        });
      } else if (Array.isArray(splitJson) && splitJson.length > 0) {
        milestoneData = splitJson.map((m: any, idx: number) => ({
          orderId: newOrder.id,
          label: m.label || `Milestone ${idx + 1}`,
          percentage: Number(m.percentage) || 50,
          amount: m.amount ? new Prisma.Decimal(m.amount).toDecimalPlaces(2) : subtotal.mul((Number(m.percentage) || 50) / 100).toDecimalPlaces(2),
          sortOrder: idx + 1,
          status: MilestoneStatus.LOCKED,
          note: m.note || `Milestone ${idx + 1} held in Ophir Vault Escrow.`,
        }));
      } else {
        // Fallback: 50% deposit and 50% final completion
        const halfAmount = subtotal.div(2).toDecimalPlaces(2);
        const secondHalf = subtotal.sub(halfAmount);

        milestoneData = [
          {
            orderId: newOrder.id,
            label: 'Deposit & Date Reservation (50%)',
            percentage: 50,
            amount: halfAmount,
            sortOrder: 1,
            status: MilestoneStatus.LOCKED,
            note: 'Funds held in Ophir Vault Escrow custody until event date.',
          },
          {
            orderId: newOrder.id,
            label: 'Final Event Execution & Teaser Signoff (50%)',
            percentage: 50,
            amount: secondHalf,
            sortOrder: 2,
            status: MilestoneStatus.LOCKED,
            note: 'Released after successful event execution and delivery sign-off.',
          },
        ];
      }

      await this.prisma.milestone.createMany({
        data: milestoneData,
      });
    }

    const activeOrder = existingOrder || (await this.prisma.order.findFirst({ where: { offerId } }));

    return {
      message: 'Offer accepted successfully, remaining offers declined, and escrow order generated',
      offerId,
      jobId,
      orderId: activeOrder?.id,
      orderNumber: activeOrder?.orderNumber,
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
