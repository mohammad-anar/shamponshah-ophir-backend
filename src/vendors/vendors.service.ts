import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  VendorOnboardingDto,
  UpdateVendorProfileDto,
  ToggleVacationModeDto,
  CreateBlockedDateDto,
  CreatePortfolioItemDto,
  VendorQueryDto,
} from './dto/vendor.dto';
import { VendorStatus, VendorTier, OrderStatus } from '@prisma/client';

export function formatVendor(v: any) {
  if (!v) return v;

  const vendorCategoryIds = v.categories?.map((c: any) => c.categoryId || c.category?.id).filter(Boolean) || [];
  // Prioritize gigs matching vendor's actual category
  const matchingGigs = (v.gigs && v.gigs.length > 0)
    ? (vendorCategoryIds.length > 0
        ? v.gigs.filter((g: any) => vendorCategoryIds.includes(g.categoryId))
        : v.gigs)
    : [];

  const primaryGig = (matchingGigs.length > 0 ? matchingGigs[0] : v.gigs?.[0]);
  const primaryPackage = primaryGig?.packages?.[0];
  const startingPrice = primaryPackage ? Number(primaryPackage.price) : (v.startingPrice || 750);
  const categoryName = v.categories?.[0]?.category?.name || 'Catering & Artisanal Dining';
  const categorySlug = v.categories?.[0]?.category?.slug || 'catering-dining';

  // Gather all unique gallery images from portfolio and matching gigs
  const gigImages = (matchingGigs.length > 0 ? matchingGigs : (v.gigs || [])).flatMap(
    (g: any) => g.gallery?.map((img: any) => img.url) || []
  );
  const allGalleryImages = Array.from(
    new Set([...(v.portfolio?.map((p: any) => p.url) || []), ...gigImages])
  ).filter(Boolean);

  const fallbackImages = [
    'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1583394293214-28ded15ee548?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80',
  ];

  const defaultTags = categorySlug.includes('catering')
    ? ['Plated Dining', 'Artisanal Catering', 'Private Chef', 'Escrow Protected']
    : ['Vetted Artisan', 'Escrow Protected', 'On-Time Guaranteed'];

  // All active services formatted
  const activeGigs = matchingGigs.length > 0 ? matchingGigs : (v.gigs || []);
  const services = activeGigs.map((g: any) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    tags: g.tags || [],
    startingPrice: g.packages?.[0] ? Number(g.packages[0].price) : startingPrice,
    packages: (g.packages || []).map((pkg: any) => ({
      id: pkg.id,
      title: pkg.title,
      description: pkg.description,
      price: Number(pkg.price),
      hours: pkg.hours || '4-6 hours',
      turnaround: pkg.turnaround || '24-48 hours',
      escrowSplit: '50% Deposit • 50% Final Delivery',
      isPopular: pkg.isPopular,
      features: pkg.features || ['Full culinary preparation', 'Escrow milestone safety'],
    })),
    gallery: (g.gallery || []).map((img: any) => img.url),
  }));

  return {
    ...v,
    name: v.businessName,
    title: v.tagline || (v.bio ? v.bio.slice(0, 80) : 'Verified Ophir Artisan'),
    category: categorySlug,
    categoryLabel: categoryName,
    location: v.city ? `${v.city}, ${v.state || 'IL'}` : 'Naperville, IL',
    distance: 'Within service radius',
    guildTier: v.tier ? (v.tier.charAt(0) + v.tier.slice(1).toLowerCase()) : 'Elite',
    guildTierLabel: `${v.tier ? (v.tier.charAt(0) + v.tier.slice(1).toLowerCase()) : 'Elite'} Level`,
    avatar: v.avatarUrl || 'https://images.unsplash.com/photo-1583394293214-28ded15ee548?auto=format&fit=crop&w=400&q=80',
    heroImage: v.heroImageUrl || 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=80',
    galleryImages: allGalleryImages.length > 0 ? allGalleryImages : fallbackImages,
    tags: primaryGig?.tags && primaryGig.tags.length > 0 ? primaryGig.tags : defaultTags,
    startingPrice,
    onTimeDelivery: `${v.onTimeDeliveryPct || 99}%`,
    repeatClients: `${v.repeatClientPct || 85}%`,
    services,
    packages: primaryGig?.packages && primaryGig.packages.length > 0
      ? primaryGig.packages.map((pkg: any) => ({
          id: pkg.id,
          title: pkg.title,
          description: pkg.description,
          price: Number(pkg.price),
          hours: pkg.hours || '4-6 hours',
          turnaround: pkg.turnaround || '24-48 hours',
          escrowSplit: '50% Deposit • 50% Final Delivery',
          isPopular: pkg.isPopular,
          features: pkg.features || ['Full event service', 'Escrow milestone safety'],
        }))
      : [
          {
            id: 'pkg-default-1',
            title: 'Essential Celebration Package',
            description: 'Complete core service package with foundational coverage and preparation.',
            price: startingPrice,
            hours: '4 hours',
            turnaround: '48 hours',
            escrowSplit: '50% Deposit • 50% Final Delivery',
            isPopular: true,
            features: ['Professional preparation', 'Direct chat with artisan', 'Escrow milestone safety'],
          },
        ],
    reviewsList: v.vendorReviews && v.vendorReviews.length > 0
      ? v.vendorReviews.map((r: any) => ({
          author: r.clientProfile?.displayName || 'Client',
          event: r.title || 'Executive Milestone Gala',
          date: new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          rating: r.rating,
          text: r.comment,
          reply: r.vendorReply ? { author: v.businessName, text: r.vendorReply } : undefined,
        }))
      : [],
  };
}

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Public Directory & Search ──────────────────────────────

  async searchVendors(query: VendorQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 12));
    const skip = (page - 1) * limit;

    const where: any = {
      status: VendorStatus.APPROVED,
    };

    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }

    if (query.tier) {
      where.tier = query.tier as VendorTier;
    }

    if (query.minRating) {
      where.rating = { gte: Number(query.minRating) };
    }

    if (query.search) {
      where.OR = [
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { bio: { contains: query.search, mode: 'insensitive' } },
        { tagline: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.categories = {
        some: {
          OR: [
            { categoryId: query.category },
            { category: { slug: query.category } },
          ],
        },
      };
    }

    const [vendors, total] = await Promise.all([
      this.prisma.vendorProfile.findMany({
        where,
        include: {
          categories: { include: { category: true } },
          portfolio: { take: 4, orderBy: { sortOrder: 'asc' } },
          gigs: {
            where: { status: 'ACTIVE' },
            select: { id: true, title: true, slug: true, packages: { take: 1, orderBy: { price: 'asc' } } },
          },
        },
        orderBy: [{ rating: 'desc' }, { ordersCompleted: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.vendorProfile.count({ where }),
    ]);

    return {
      data: vendors.map(formatVendor),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Public Vendor Profile ──────────────────────────────────

  async getVendorBySlug(slug: string) {
    const cacheKey = `vendor:profile:${slug}`;
    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const vendor = await this.prisma.vendorProfile.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
      },
      include: {
        categories: { include: { category: true } },
        portfolio: { orderBy: { sortOrder: 'asc' } },
        gigs: {
          where: { status: 'ACTIVE' },
          include: {
            packages: { orderBy: { price: 'asc' } },
            gallery: { orderBy: { sortOrder: 'asc' } },
          },
        },
        vendorReviews: {
          where: { isPublished: true },
          include: {
            clientProfile: { select: { displayName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        blockedDates: {
          where: { date: { gte: new Date() } },
          select: { date: true },
        },
      },
    });

    if (!vendor) throw new NotFoundException('Vendor not found');

    const formatted = formatVendor(vendor);
    await this.redis.setJson(cacheKey, formatted, 300); // 5 min
    return formatted;
  }

  // ── Vendor Authenticated: Profile & Onboarding ─────────────

  async getMyProfile(vendorProfileId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      include: {
        categories: { include: { category: true } },
        portfolio: { orderBy: { sortOrder: 'asc' } },
        blockedDates: { orderBy: { date: 'asc' } },
        levelHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }

  async submitOnboarding(vendorProfileId: string, dto: VendorOnboardingDto) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const slug = dto.businessName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    // check if slug taken by another
    const existingSlug = await this.prisma.vendorProfile.findFirst({
      where: { slug, NOT: { id: vendorProfileId } },
    });
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString().slice(-4)}` : slug;

    // update profile data
    const updated = await this.prisma.vendorProfile.update({
      where: { id: vendorProfileId },
      data: {
        businessName: dto.businessName,
        slug: finalSlug,
        tagline: dto.tagline,
        bio: dto.bio,
        city: dto.city,
        state: dto.state,
        serviceRadius: dto.serviceRadius,
        responseSpeed: dto.responseSpeed,
        avatarUrl: dto.avatarUrl,
        heroImageUrl: dto.heroImageUrl,
        status: VendorStatus.APPROVED, // auto-approve for streamlined demo / or PENDING_APPROVAL
      },
    });

    // attach categories
    if (dto.categoryIds && dto.categoryIds.length > 0) {
      await this.prisma.vendorCategory.deleteMany({ where: { vendorProfileId } });
      await this.prisma.vendorCategory.createMany({
        data: dto.categoryIds.map((categoryId: string) => ({ vendorProfileId, categoryId })),
        skipDuplicates: true,
      });
    }

    await this.redis.del(`vendor:profile:${vendor.slug}`);
    await this.redis.del(`vendor:profile:${finalSlug}`);

    return updated;
  }

  async updateProfile(vendorProfileId: string, dto: UpdateVendorProfileDto) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const { categoryIds, name, title, location, startingPrice, ...fields } = dto;
    const dataToUpdate: any = { ...fields };
    if (name) dataToUpdate.businessName = name;
    if (title) dataToUpdate.tagline = title;
    if (location) {
      const parts = location.split(',');
      dataToUpdate.city = parts[0]?.trim();
      if (parts[1]) dataToUpdate.state = parts[1]?.trim();
    }

    const updated = await this.prisma.vendorProfile.update({
      where: { id: vendorProfileId },
      data: dataToUpdate,
    });

    if (categoryIds && categoryIds.length > 0) {
      await this.prisma.vendorCategory.deleteMany({ where: { vendorProfileId } });
      await this.prisma.vendorCategory.createMany({
        data: categoryIds.map((categoryId: string) => ({ vendorProfileId, categoryId })),
        skipDuplicates: true,
      });
    }

    await this.redis.del(`vendor:profile:${vendor.slug}`);
    return updated;
  }

  // ── Analytics ──────────────────────────────────────────────

  async getVendorAnalytics(vendorProfileId: string, range?: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      include: {
        gigs: { select: { id: true, title: true, viewCount: true } },
        _count: { select: { vendorOrders: true, offers: true, vendorReviews: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor profile not found');

    const [earningsSum, activeOrdersCount, completedOrdersCount, acceptedOffersCount, earningsList] = await Promise.all([
      this.prisma.earning.aggregate({
        where: { vendorProfileId },
        _sum: { amount: true },
      }),
      this.prisma.order.count({
        where: { vendorProfileId, status: { in: [OrderStatus.ACTIVE, OrderStatus.IN_PROGRESS] } },
      }),
      this.prisma.order.count({
        where: { vendorProfileId, status: OrderStatus.COMPLETED },
      }),
      this.prisma.offer.count({
        where: { vendorProfileId, status: 'ACCEPTED' },
      }),
      this.prisma.earning.findMany({
        where: { vendorProfileId },
        select: { amount: true, createdAt: true },
      }),
    ]);

    const gigViewsSum = vendor.gigs.reduce((acc, g) => acc + (g.viewCount || 0), 0);
    const totalOffers = vendor._count.offers;
    const proposalWinRate = totalOffers > 0 ? Number(((acceptedOffersCount / totalOffers) * 100).toFixed(1)) : 0;
    const totalEarned = Number(earningsSum._sum.amount || 0);
    const totalOrdersCompleted = completedOrdersCount;
    const avgOrderValue = totalOrdersCompleted > 0 ? Math.round(totalEarned / totalOrdersCompleted) : 0;

    // Dynamic Monthly Revenue based on range (6M, 12M, or all)
    const is12M = range === '12M' || range?.toLowerCase() === 'all';
    const monthsCount = is12M ? 12 : 6;
    const now = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyRevenue = [];

    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const mName = monthNames[mIdx];
      const isCurrent = i === 0;

      const matchedEarnings = earningsList
        .filter((e) => {
          const eDate = new Date(e.createdAt);
          return eDate.getMonth() === mIdx && eDate.getFullYear() === yr;
        })
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const finalAmount = matchedEarnings;

      // Height between 28px and 130px
      const height = finalAmount > 0 ? Math.min(130, Math.max(4, Math.round((finalAmount / Math.max(totalEarned, 1)) * 120))) : 0;

      monthlyRevenue.push({
        month: mName,
        year: yr,
        amount: `$${finalAmount}${isCurrent ? ' (Current)' : ''}`,
        rawAmount: finalAmount,
        height,
        isCurrent,
      });
    }

    // Level progress calculation
    const tier = vendor.tier || 'RISING';
    const nextTier = tier === 'SPROUT' ? 'Rising Vendor' : tier === 'RISING' ? 'Pro Vendor' : tier === 'PRO' ? 'Elite Vendor' : 'Max Guild Tier';
    const targetOrders = tier === 'SPROUT' ? 5 : tier === 'RISING' ? 15 : tier === 'PRO' ? 40 : 100;
    const targetDays = tier === 'SPROUT' ? 15 : tier === 'RISING' ? 30 : tier === 'PRO' ? 60 : 120;
    const daysActive = Math.max(1, Math.floor((now.getTime() - new Date(vendor.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
    const ordersPct = Math.min(1, totalOrdersCompleted / targetOrders);
    const daysPct = Math.min(1, daysActive / targetDays);
    const progressPercent = Math.min(100, Math.round((ordersPct * 0.65 + daysPct * 0.35) * 100));

    return {
      profileImpressions: gigViewsSum,
      proposalWinRate,
      avgOrderValue,
      totalEarned,
      ordersCompleted: totalOrdersCompleted,
      activeOrdersCount,
      rating: Number(vendor.rating) || 0,
      reviewsCount: vendor._count?.vendorReviews || 0,
      onTimeDeliveryPct: vendor.onTimeDeliveryPct || 0,
      repeatClientPct: vendor.repeatClientPct || 0,
      responseRate: null,
      tier: vendor.tier,
      monthlyRevenue,
      levelProgress: {
        currentTier: vendor.tier || 'RISING',
        nextTier,
        progressPercent,
        ordersCompleted: totalOrdersCompleted,
        targetOrders,
        daysActive,
        targetDays,
        remainingOrders: Math.max(0, targetOrders - totalOrdersCompleted),
        remainingDays: Math.max(0, targetDays - daysActive),
      },
    };
  }

  // ── Vacation Mode ──────────────────────────────────────────

  async toggleVacationMode(vendorProfileId: string, dto: ToggleVacationModeDto) {
    return this.prisma.vendorProfile.update({
      where: { id: vendorProfileId },
      data: {
        isVacationMode: dto.isVacationMode,
        vacationEndsAt: dto.vacationEndsAt ? new Date(dto.vacationEndsAt) : null,
      },
    });
  }

  // ── Blocked Dates / Calendar ───────────────────────────────

  async getBlockedDates(vendorProfileId: string) {
    return this.prisma.blockedDate.findMany({
      where: { vendorProfileId },
      orderBy: { date: 'asc' },
    });
  }

  async addBlockedDate(vendorProfileId: string, dto: CreateBlockedDateDto) {
    return this.prisma.blockedDate.create({
      data: {
        vendorProfileId,
        date: new Date(dto.date),
        reason: dto.reason,
      },
    });
  }

  async removeBlockedDate(vendorProfileId: string, id: string) {
    const bd = await this.prisma.blockedDate.findFirst({
      where: { id, vendorProfileId },
    });
    if (!bd) throw new NotFoundException('Blocked date not found');

    await this.prisma.blockedDate.delete({ where: { id } });
    return { message: 'Blocked date removed' };
  }

  // ── Portfolio ──────────────────────────────────────────────

  async addPortfolioItem(vendorProfileId: string, dto: CreatePortfolioItemDto) {
    return this.prisma.portfolioItem.create({
      data: {
        vendorProfileId,
        url: dto.url,
        type: dto.type || 'image',
        caption: dto.caption,
        sortOrder: dto.sortOrder || 0,
      },
    });
  }

  async deletePortfolioItem(vendorProfileId: string, id: string) {
    const item = await this.prisma.portfolioItem.findFirst({
      where: { id, vendorProfileId },
    });
    if (!item) throw new NotFoundException('Portfolio item not found');

    await this.prisma.portfolioItem.delete({ where: { id } });
    return { message: 'Portfolio item deleted' };
  }

  // ── Client: Save / Bookmark Vendor ─────────────────────────

  async toggleSaveVendor(userId: string, vendorProfileId: string) {
    let vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
    });
    if (!vendor) {
      vendor = await this.prisma.vendorProfile.findFirst({
        where: { slug: vendorProfileId },
      });
    }
    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const realVendorId = vendor.id;

    const existing = await this.prisma.savedVendor.findUnique({
      where: { userId_vendorProfileId: { userId, vendorProfileId: realVendorId } },
    });

    if (existing) {
      await this.prisma.savedVendor.delete({ where: { id: existing.id } });
      return { saved: false, message: 'Vendor removed from saved', vendorId: realVendorId };
    } else {
      await this.prisma.savedVendor.create({
        data: { userId, vendorProfileId: realVendorId },
      });
      return { saved: true, message: 'Vendor saved', vendorId: realVendorId };
    }
  }

  async getSavedVendors(userId: string) {
    const saved = await this.prisma.savedVendor.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const vendorIds = saved.map((s: any) => s.vendorProfileId);
    if (vendorIds.length === 0) return [];

    return this.prisma.vendorProfile.findMany({
      where: { id: { in: vendorIds } },
      include: {
        categories: { include: { category: true } },
        portfolio: { take: 1, orderBy: { sortOrder: 'asc' } },
        gigs: {
          where: { status: 'ACTIVE' },
          select: { id: true, title: true, slug: true, packages: { take: 1, orderBy: { price: 'asc' } } },
        },
      },
    });
  }
}
