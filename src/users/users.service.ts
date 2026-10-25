import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClientProfileDto, ChangePasswordDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';
import { OrderStatus, JobStatus, GigStatus, MilestoneStatus, PaymentStatus, TransactionType } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Client Profile ─────────────────────────────────────────

  async getClientProfile(clientProfileId: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      include: {
        user: { select: { email: true, role: true, isEmailVerified: true, createdAt: true } },
        _count: { select: { orders: true, jobs: true, paymentMethods: true } },
      },
    });
    if (!profile) throw new NotFoundException('Client profile not found');
    return profile;
  }

  async updateClientProfile(clientProfileId: string, dto: UpdateClientProfileDto) {
    const profile = await this.prisma.clientProfile.findUnique({ where: { id: clientProfileId } });
    if (!profile) throw new NotFoundException('Client profile not found');

    const notificationPreferences = dto.notificationPreferences;
    if (notificationPreferences) {
      const allowedKeys = ['emailBids', 'smsMilestones', 'familyHubDigest'];
      for (const [key, value] of Object.entries(notificationPreferences)) {
        if (!allowedKeys.includes(key) || typeof value !== 'boolean') {
          throw new BadRequestException('Invalid notification preferences');
        }
      }
    }

    return this.prisma.clientProfile.update({
      where: { id: clientProfileId },
      data: { ...dto, notificationPreferences: notificationPreferences as any },
    });
  }

  // ── Password Management ────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Current password does not match');

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { message: 'Password updated successfully' };
  }

  // ── Client Dashboard Overview ──────────────────────────────

  async getClientOverview(clientProfileId: string) {
    const clientProfile = await this.prisma.clientProfile.findUnique({
      where: { id: clientProfileId },
      select: {
        id: true,
        userId: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    if (!clientProfile) {
      throw new NotFoundException('Client profile not found');
    }

    // 1. Fetch upcoming scheduled bookings
    const upcomingBookings = await this.prisma.order.findMany({
      where: {
        clientProfileId,
        status: { in: [OrderStatus.ACTIVE, OrderStatus.IN_PROGRESS] },
      },
      include: {
        vendorProfile: {
          select: {
            id: true,
            slug: true,
            businessName: true,
            avatarUrl: true,
            city: true,
            rating: true,
          },
        },
        gig: {
          select: {
            id: true,
            title: true,
            category: { select: { name: true } },
          },
        },
        milestones: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });

    const [
      activeOrders,
      completedOrdersCount,
      openJobs,
      totalSpentResult,
      refundsResult,
      savedVendorsCount,
      familyWorkspace,
      recommendedGigs,
      allClientOrdersForSpending,
      escrowInCustodyResult,
    ] = await Promise.all([
      // Active / In-progress orders
      this.prisma.order.findMany({
        where: {
          clientProfileId,
          status: { in: [OrderStatus.ACTIVE, OrderStatus.IN_PROGRESS] },
        },
        include: {
          vendorProfile: {
            select: {
              id: true,
              slug: true,
              businessName: true,
              avatarUrl: true,
              city: true,
              rating: true,
            },
          },
          gig: {
            select: {
              id: true,
              title: true,
              category: { select: { name: true } },
            },
          },
          milestones: {
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // Completed orders count
      this.prisma.order.count({
        where: { clientProfileId, status: OrderStatus.COMPLETED },
      }),

      // Open jobs with proposals
      this.prisma.job.findMany({
        where: { clientProfileId, status: JobStatus.OPEN },
        include: {
          offers: {
            include: {
              vendorProfile: {
                select: {
                  id: true,
                  slug: true,
                  businessName: true,
                  avatarUrl: true,
                  city: true,
                  rating: true,
                  tier: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: { select: { offers: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // Client spend includes successful milestone charges, less completed refunds.
      this.prisma.transaction.aggregate({
        where: { clientProfileId, type: TransactionType.ESCROW_DEPOSIT, status: PaymentStatus.SUCCEEDED },
        _sum: { amount: true },
      }),

      this.prisma.transaction.aggregate({
        where: { clientProfileId, type: TransactionType.REFUND, status: PaymentStatus.SUCCEEDED },
        _sum: { amount: true },
      }),

      // Saved vendors count
      this.prisma.savedVendor.count({
        where: { userId: clientProfile.userId },
      }),

      // Family workspace
      this.prisma.familyWorkspace.findFirst({
        where: { ownerId: clientProfileId },
        include: {
          members: true,
          boards: {
            include: {
              items: true,
            },
          },
        },
      }),

      // Real recommended active gigs
      this.prisma.gig.findMany({
        where: { status: GigStatus.ACTIVE },
        include: {
          vendorProfile: {
            select: {
              id: true,
              slug: true,
              businessName: true,
              avatarUrl: true,
              rating: true,
              tier: true,
              city: true,
            },
          },
          category: { select: { name: true } },
          packages: {
            take: 1,
            orderBy: { price: 'asc' },
          },
        },
        orderBy: { orderCount: 'desc' },
        take: 4,
      }),

      // All orders for spending breakdown
      this.prisma.order.findMany({
        where: { clientProfileId },
        include: {
          gig: {
            select: {
              category: { select: { name: true } },
            },
          },
          transactions: {
            where: {
              status: PaymentStatus.SUCCEEDED,
              type: { in: [TransactionType.ESCROW_DEPOSIT, TransactionType.REFUND] },
            },
            select: { type: true, amount: true },
          },
        },
      }),
      this.prisma.milestone.aggregate({
        where: {
          order: { is: { clientProfileId } },
          status: { in: [MilestoneStatus.FUNDED, MilestoneStatus.PENDING_RELEASE, MilestoneStatus.APPROVED_PENDING_RELEASE] },
        },
        _sum: { amount: true },
      }),
    ]);

    // Calculate spending breakdown from actual orders
    const spendingBreakdown: { category: string; amount: number }[] = [];
    allClientOrdersForSpending.forEach((o) => {
      const catName = o.gig?.category?.name || 'Artisan Services';
      const existing = spendingBreakdown.find((s) => s.category === catName);
      const val = (o.transactions || []).reduce((sum, tx) =>
        sum + (tx.type === TransactionType.REFUND ? -Number(tx.amount) : Number(tx.amount)), 0);
      if (existing) {
        existing.amount += val;
      } else {
        spendingBreakdown.push({ category: catName, amount: val });
      }
    });

    return {
      clientProfile,
      upcomingBookings,
      upcomingEvents: [],
      activeOrders,
      completedOrdersCount,
      openJobs,
      totalSpent: Math.max(0, Number(totalSpentResult._sum.amount || 0) - Number(refundsResult._sum.amount || 0)),
      escrowInCustody: Number(escrowInCustodyResult._sum.amount || 0),
      savedVendorsCount,
      familyWorkspace: familyWorkspace
        ? {
            id: familyWorkspace.id,
            name: familyWorkspace.name,
            membersCount: familyWorkspace.members.length,
            boardsCount: familyWorkspace.boards.length,
            totalItemsCount: familyWorkspace.boards.reduce((acc, b) => acc + b.items.length, 0),
          }
        : null,
      recommendedGigs: recommendedGigs.map((g) => ({
        id: g.id,
        title: g.title,
        slug: g.slug,
        category: g.category?.name || 'Celebration Service',
        vendorName: g.vendorProfile?.businessName || 'Verified Artisan',
        vendorSlug: g.vendorProfile?.slug || g.vendorProfileId,
        rating: g.vendorProfile?.rating ? Number(g.vendorProfile.rating).toFixed(1) : '5.0',
        tier: g.vendorProfile?.tier || 'PRO',
        startingPrice: g.packages?.[0]?.price ? `$${Number(g.packages[0].price).toLocaleString()}` : '$250',
      })),
      spendingBreakdown,
    };
  }

  // ── Vendor Dashboard Overview ──────────────────────────────

  async getVendorOverview(vendorProfileId: string) {
    const [
      activeOrders,
      pendingOffers,
      gigsCount,
      earningsResult,
      availableResult,
      pendingResult,
      escrowResult,
      vendorProfile,
      recentJobs,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          vendorProfileId,
          status: { in: [OrderStatus.ACTIVE, OrderStatus.IN_PROGRESS] },
        },
        include: {
          clientProfile: { select: { displayName: true, avatarUrl: true } },
          milestones: { orderBy: { sortOrder: 'asc' } },
          gig: { select: { id: true, title: true } },
          package: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.offer.count({
        where: { vendorProfileId, status: 'PENDING' },
      }),
      this.prisma.gig.count({
        where: { vendorProfileId, status: 'ACTIVE' },
      }),
      this.prisma.earning.aggregate({
        where: { vendorProfileId },
        _sum: { amount: true },
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
      this.prisma.vendorProfile.findUnique({
        where: { id: vendorProfileId },
        include: {
          categories: { include: { category: true } },
          _count: { select: { vendorOrders: true, gigs: true, offers: true, vendorReviews: true } },
        },
      }),
      this.prisma.job.findMany({
        where: {
          status: JobStatus.OPEN,
          ...(vendorProfileId
            ? {
                offers: {
                  none: {
                    vendorProfileId,
                  },
                },
              }
            : {}),
        },
        include: {
          clientProfile: { select: { displayName: true, city: true, state: true } },
          category: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ]);

    const availableBalance = Number(availableResult._sum.amount || 0);
    const pendingBalance = Number(pendingResult._sum.amount || 0);
    const escrowBalance = Number(escrowResult._sum.amount || 0);
    const totalEarned = Number(earningsResult._sum.amount || 0);

    return {
      activeOrders: activeOrders.map((ord) => ({
        id: ord.id,
        orderNumber: ord.orderNumber,
        service: ord.gig?.title || ord.package?.title || ord.deliveryNotes || 'Celebration Service Fulfillment',
        client: ord.clientProfile?.displayName || 'Verified Client',
        totalAmount: `$${Number(ord.grandTotal || ord.subtotal || 0).toLocaleString()}`,
        grandTotal: ord.grandTotal,
        eventDate: ord.eventDate,
        status: ord.status,
        milestones: ord.milestones,
      })),
      recentJobs: recentJobs.map((j) => ({
        id: j.id,
        title: j.title,
        budget: j.budgetMin && j.budgetMax ? `$${j.budgetMin} – $${j.budgetMax}` : '$600 – $1,200',
        location: j.clientProfile?.city ? `${j.clientProfile.city}, ${j.clientProfile.state || 'IL'}` : 'Chicago, IL',
        eventDate: j.eventDate,
        credits: 2,
        category: j.category?.name || 'Event Production',
      })),
      pendingOffersCount: pendingOffers,
      activeGigsCount: gigsCount,
      availableBalance,
      pendingBalance,
      escrowBalance,
      totalEarned,
      vendorProfile,
    };
  }
}
