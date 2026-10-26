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
import { calculateVendorBaseScore, applySessionSeededRanking } from '../ranking/ranking.engine';
import { VENDOR_LEVELS_CONFIG, evaluateVendorTier } from '../config/vendor-levels.config';

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

    const allMatchingVendors = await this.prisma.vendorProfile.findMany({
      where,
      include: {
        categories: { include: { category: true } },
        portfolio: { take: 4, orderBy: { sortOrder: 'asc' } },
        gigs: {
          where: { status: 'ACTIVE' },
          select: { id: true, title: true, slug: true, packages: { take: 1, orderBy: { price: 'asc' } } },
        },
      },
    });

    const total = allMatchingVendors.length;

    // Apply ranking engine or specific sort criteria
    let rankedVendors = allMatchingVendors;
    const sortBy = query.sortBy || 'recommended';

    if (sortBy === 'rating') {
      rankedVendors.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    } else if (sortBy === 'orders') {
      rankedVendors.sort((a, b) => Number(b.ordersCompleted || 0) - Number(a.ordersCompleted || 0));
    } else if (sortBy === 'level') {
      const levelMap: Record<string, number> = { ELITE: 4, PRO: 3, RISING: 2, SPROUT: 1 };
      rankedVendors.sort((a, b) => (levelMap[b.tier || ''] || 0) - (levelMap[a.tier || ''] || 0));
    } else {
      // Default view: Fair ranking engine with cold-start boost + deterministic session-based shuffle
      const sessionSeed = query.seed || 'session_default';
      rankedVendors = applySessionSeededRanking(
        allMatchingVendors,
        (v) =>
          calculateVendorBaseScore({
            id: v.id,
            deliveryRate: v.onTimeDeliveryPct,
            rating: v.rating,
            tier: v.tier,
            ordersCompleted: v.ordersCompleted,
            createdAt: v.createdAt,
          }),
        sessionSeed,
        24, // +/- 12 points jitter for healthy rotation
      );
    }

    const pagedVendors = rankedVendors.slice(skip, skip + limit);

    return {
      data: pagedVendors.map(formatVendor),
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
    if (!vendorProfileId) throw new NotFoundException('Vendor profile not found');
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

  async getOrCreateVendorProfile(userId: string, email?: string) {
    let vp = await this.prisma.vendorProfile.findUnique({
      where: { userId },
      include: {
        categories: { include: { category: true } },
        portfolio: { orderBy: { sortOrder: 'asc' } },
        blockedDates: { orderBy: { date: 'asc' } },
        levelHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!vp) {
      const baseName = email ? email.split('@')[0] : `Vendor-${Date.now().toString(36)}`;
      const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
      vp = await this.prisma.vendorProfile.create({
        data: {
          userId,
          businessName: baseName,
          slug,
        },
        include: {
          categories: { include: { category: true } },
          portfolio: { orderBy: { sortOrder: 'asc' } },
          blockedDates: { orderBy: { date: 'asc' } },
          levelHistory: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      });
    }
    return vp;
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

    // Level progress calculation driven by VENDOR_LEVELS_CONFIG
    const currentTier = (vendor.tier || VendorTier.SPROUT) as VendorTier;
    const currentConfig = VENDOR_LEVELS_CONFIG[currentTier] || VENDOR_LEVELS_CONFIG[VendorTier.SPROUT];

    const nextTierMap: Record<VendorTier, VendorTier | null> = {
      [VendorTier.SPROUT]: VendorTier.RISING,
      [VendorTier.RISING]: VendorTier.PRO,
      [VendorTier.PRO]: VendorTier.ELITE,
      [VendorTier.ELITE]: null,
    };
    const nextTierKey = nextTierMap[currentTier];
    const nextConfig = nextTierKey ? VENDOR_LEVELS_CONFIG[nextTierKey] : null;

    const targetOrders = nextConfig ? nextConfig.minCompletedOrders : currentConfig.minCompletedOrders;
    const targetEarnings = nextConfig ? nextConfig.minEarnings : currentConfig.minEarnings;
    const ordersPct = targetOrders > 0 ? Math.min(1, totalOrdersCompleted / targetOrders) : 1;
    const earningsPct = targetEarnings > 0 ? Math.min(1, totalEarned / targetEarnings) : 1;
    const progressPercent = nextConfig
      ? Math.min(100, Math.round(Math.max(ordersPct, earningsPct) * 100))
      : 100;

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
        currentTier: vendor.tier || 'SPROUT',
        nextTier: nextConfig?.title || 'Max Guild Tier',
        progressPercent,
        ordersCompleted: totalOrdersCompleted,
        targetOrders,
        targetEarnings,
        remainingOrders: Math.max(0, targetOrders - totalOrdersCompleted),
        remainingEarnings: Math.max(0, targetEarnings - totalEarned),
        currentTheme: currentConfig.theme,
      },
    };
  }

  async evaluateAndPromoteVendor(vendorProfileId: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
    });

    if (!vendor) return null;

    const [allOrders, completedOrdersList, cancelledOrdersCount] = await Promise.all([
      this.prisma.order.count({ where: { vendorProfileId } }),
      this.prisma.order.findMany({
        where: {
          vendorProfileId,
          status: { in: [OrderStatus.COMPLETED, 'COMPLETED_WITH_PARTIAL_REFUND' as any] },
        },
        select: { vendorNet: true, amount: true },
      }),
      this.prisma.order.count({
        where: { vendorProfileId, status: OrderStatus.CANCELLED },
      }),
    ]);

    const completedOrders = completedOrdersList.length;
    const totalEarnings = completedOrdersList.reduce((acc, o) => acc + Number(o.vendorNet || o.amount || 0), 0);
    const deliveryRate = (completedOrders + cancelledOrdersCount) > 0
      ? (completedOrders / (completedOrders + cancelledOrdersCount)) * 100
      : (vendor.onTimeDeliveryPct || 100);
    const cancelRatio = allOrders > 0 ? (cancelledOrdersCount / allOrders) * 100 : 0;
    const avgRating = Number(vendor.rating) || 5.0;

    const newTier = evaluateVendorTier({
      completedOrders,
      totalEarnings,
      deliveryRate,
      avgRating,
      cancelRatio,
    });

    if (vendor.tier !== newTier) {
      await Promise.all([
        this.prisma.vendorProfile.update({
          where: { id: vendor.id },
          data: { tier: newTier },
        }),
        this.prisma.levelHistory.create({
          data: {
            vendorProfileId: vendor.id,
            fromTier: vendor.tier,
            toTier: newTier,
            reason: `Progression evaluated via config rules. Orders: ${completedOrders}, Earnings: $${totalEarnings}, Delivery: ${deliveryRate.toFixed(1)}%`,
          },
        }),
      ]);
      return { promoted: true, fromTier: vendor.tier, toTier: newTier };
    }

    return { promoted: false, tier: vendor.tier };
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
    const itemUrl = dto.url || dto.image || '';
    if (!itemUrl) {
      throw new BadRequestException('Image URL is required');
    }

    const created = await this.prisma.portfolioItem.create({
      data: {
        vendorProfileId,
        url: itemUrl,
        type: dto.type || 'image',
        caption: dto.caption || dto.title || 'Celebration Portfolio Item',
        sortOrder: dto.sortOrder || 0,
      },
    });

    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      select: { slug: true },
    });
    if (vendor?.slug) {
      await this.redis.del(`vendor:profile:${vendor.slug}`);
    }

    return created;
  }

  async deletePortfolioItem(vendorProfileId: string, id: string) {
    const item = await this.prisma.portfolioItem.findFirst({
      where: { id, vendorProfileId },
    });
    if (!item) throw new NotFoundException('Portfolio item not found');

    await this.prisma.portfolioItem.delete({ where: { id } });
    return { message: 'Portfolio item deleted' };
  }

  async getShowcase() {
    const items = await this.prisma.portfolioItem.findMany({
      take: 12,
      orderBy: { createdAt: 'desc' },
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
            categories: { include: { category: true } },
          },
        },
      },
    });

    if (items && items.length > 0) {
      return items;
    }

    return [
      {
        id: 'showcase-1',
        url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
        caption: 'Luxury Milestone Wedding Ceremony & Stage',
        vendorProfile: {
          businessName: 'Royal Stage & Floral Design',
          city: 'Chicago, IL',
          tier: 'ELITE',
        },
      },
      {
        id: 'showcase-2',
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
        caption: 'Concert Audio Rig & Moving Lights for Youth Gala',
        vendorProfile: {
          businessName: 'Party Pulse Events',
          city: 'Chicago, IL',
          tier: 'PRO',
        },
      },
      {
        id: 'showcase-3',
        url: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80',
        caption: 'Gourmet Plated Multi-Course Reception Catering',
        vendorProfile: {
          businessName: 'Artisanal Culinary Guild',
          city: 'Naperville, IL',
          tier: 'ELITE',
        },
      },
      {
        id: 'showcase-4',
        url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80',
        caption: 'Grand Ballroom Sunset Ambient Lighting',
        vendorProfile: {
          businessName: 'Lumina Atmos Production',
          city: 'Austin, TX',
          tier: 'PRO',
        },
      },
    ];
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
