import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OrderStatus } from '@prisma/client';
import { TrackBatchDto, TrackingEventType, TrackingEntityType } from './dto/track-event.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private memoryCache = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Bot / Crawler Detection ──────────────────────────────────
  private isBot(userAgent?: string): boolean {
    if (!userAgent) return false;
    const ua = userAgent.toLowerCase();
    const botKeywords = [
      'bot', 'crawl', 'spider', 'slurp', 'mediapartners',
      'headlesschrome', 'lighthouse', 'bingpreview', 'feedfetcher',
      'yandex', 'baidu', 'duckduckbot', 'facebot', 'ia_archiver'
    ];
    return botKeywords.some((keyword) => ua.includes(keyword));
  }

  // ── In-memory / Redis Rate Limiter ───────────────────────────
  private async checkRateLimit(visitorId: string): Promise<boolean> {
    const key = `track:rate:${visitorId}`;
    try {
      const redisClient = this.redis.getClient();
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, 60);
      }
      return current <= 120; // Max 120 tracking events/min
    } catch {
      // In-memory fallback
      const now = Date.now();
      const current = (this.memoryCache.get(key) || 0) + 1;
      this.memoryCache.set(key, current);
      setTimeout(() => this.memoryCache.delete(key), 60000);
      return current <= 120;
    }
  }

  // ── In-memory / Redis Deduplication ──────────────────────────
  private async isDuplicate(
    eventType: TrackingEventType,
    entityType: TrackingEntityType,
    entityId: string,
    visitorId: string,
  ): Promise<boolean> {
    const ttlSeconds =
      eventType === TrackingEventType.IMPRESSION
        ? 300 // 5 minutes dedupe for impressions
        : eventType === TrackingEventType.CLICK
        ? 5 // 5 seconds dedupe for rapid double-clicks
        : 1800; // 30 minutes dedupe for full page views

    const key = `track:dedupe:${eventType}:${entityType}:${entityId}:${visitorId}`;
    try {
      const redisClient = this.redis.getClient();
      const res = await redisClient.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res !== 'OK'; // If key already exists, set returns null -> duplicate!
    } catch {
      // In-memory fallback
      if (this.memoryCache.has(key)) return true;
      this.memoryCache.set(key, 1);
      setTimeout(() => this.memoryCache.delete(key), ttlSeconds * 1000);
      return false;
    }
  }

  // ── Track Events ─────────────────────────────────────────────
  async trackEvents(dto: TrackBatchDto, clientIp?: string, userAgent?: string) {
    if (this.isBot(userAgent)) {
      return { recorded: 0, botFiltered: true };
    }

    const isAllowed = await this.checkRateLimit(dto.visitorId);
    if (!isAllowed) {
      return { recorded: 0, rateLimited: true };
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    let recordedCount = 0;

    for (const item of dto.events) {
      const isDup = await this.isDuplicate(item.type, item.entityType, item.entityId, dto.visitorId);
      if (isDup) continue;

      try {
        if (item.entityType === TrackingEntityType.GIG) {
          // Resolve gig by id or slug
          let gig = await this.prisma.gig.findUnique({
            where: { id: item.entityId },
            select: { id: true, vendorProfileId: true },
          });

          if (!gig) {
            gig = await this.prisma.gig.findUnique({
              where: { slug: item.entityId },
              select: { id: true, vendorProfileId: true },
            });
          }

          if (gig) {
            recordedCount++;
            if (item.type === TrackingEventType.IMPRESSION) {
              await Promise.all([
                this.prisma.dailyGigAnalytics.upsert({
                  where: { gigId_date: { gigId: gig.id, date: today } },
                  create: {
                    gigId: gig.id,
                    vendorProfileId: gig.vendorProfileId,
                    date: today,
                    impressions: 1,
                  },
                  update: { impressions: { increment: 1 } },
                }),
                this.prisma.dailyVendorAnalytics.upsert({
                  where: { vendorProfileId_date: { vendorProfileId: gig.vendorProfileId, date: today } },
                  create: {
                    vendorProfileId: gig.vendorProfileId,
                    date: today,
                    gigImpressions: 1,
                  },
                  update: { gigImpressions: { increment: 1 } },
                }),
                this.prisma.gig.update({
                  where: { id: gig.id },
                  data: { impressionCount: { increment: 1 } },
                }),
              ]);
            } else if (item.type === TrackingEventType.CLICK) {
              await Promise.all([
                this.prisma.dailyGigAnalytics.upsert({
                  where: { gigId_date: { gigId: gig.id, date: today } },
                  create: {
                    gigId: gig.id,
                    vendorProfileId: gig.vendorProfileId,
                    date: today,
                    clicks: 1,
                  },
                  update: { clicks: { increment: 1 } },
                }),
                this.prisma.dailyVendorAnalytics.upsert({
                  where: { vendorProfileId_date: { vendorProfileId: gig.vendorProfileId, date: today } },
                  create: {
                    vendorProfileId: gig.vendorProfileId,
                    date: today,
                    gigClicks: 1,
                  },
                  update: { gigClicks: { increment: 1 } },
                }),
                this.prisma.gig.update({
                  where: { id: gig.id },
                  data: { clickCount: { increment: 1 } },
                }),
              ]);
            } else if (item.type === TrackingEventType.VIEW) {
              await Promise.all([
                this.prisma.dailyGigAnalytics.upsert({
                  where: { gigId_date: { gigId: gig.id, date: today } },
                  create: {
                    gigId: gig.id,
                    vendorProfileId: gig.vendorProfileId,
                    date: today,
                    views: 1,
                  },
                  update: { views: { increment: 1 } },
                }),
                this.prisma.gig.update({
                  where: { id: gig.id },
                  data: { viewCount: { increment: 1 } },
                }),
              ]);
            }
          }
        } else if (item.entityType === TrackingEntityType.VENDOR) {
          // Resolve vendor by id or slug
          let vendor = await this.prisma.vendorProfile.findUnique({
            where: { id: item.entityId },
            select: { id: true },
          });

          if (!vendor) {
            vendor = await this.prisma.vendorProfile.findUnique({
              where: { slug: item.entityId },
              select: { id: true },
            });
          }

          if (vendor && item.type === TrackingEventType.VIEW) {
            recordedCount++;
            await Promise.all([
              this.prisma.dailyVendorAnalytics.upsert({
                where: { vendorProfileId_date: { vendorProfileId: vendor.id, date: today } },
                create: {
                  vendorProfileId: vendor.id,
                  date: today,
                  profileViews: 1,
                },
                update: { profileViews: { increment: 1 } },
              }),
              this.prisma.vendorProfile.update({
                where: { id: vendor.id },
                data: { profileViews: { increment: 1 } },
              }),
            ]);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Tracking event failed for ${item.type} on ${item.entityId}: ${err?.message}`);
      }
    }

    return { recorded: recordedCount, success: true };
  }

  // ── Comprehensive Fiverr-Style Vendor Analytics ──────────────
  async getVendorAnalytics(vendorProfileId: string, range = '30D', gigId?: string) {
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      include: {
        gigs: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            coverImageUrl: true,
            category: { select: { name: true } },
            gallery: { take: 1, select: { url: true } },
            packages: { take: 1, select: { price: true } },
            impressionCount: true,
            clickCount: true,
            viewCount: true,
            orderCount: true,
          },
        },
      },
    });

    if (!vendor) throw new NotFoundException('Vendor profile not found');

    // Parse date range: 7, 30, or 90 days
    const rangeClean = String(range || '30D').toUpperCase();
    const daysCount = rangeClean.includes('7') ? 7 : rangeClean.includes('90') ? 90 : 30;

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (daysCount - 1));

    // Generate list of date strings (YYYY-MM-DD)
    const dateStrings: string[] = [];
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      dateStrings.push(d.toISOString().slice(0, 10));
    }

    // Query daily analytics records in range
    const [gigAnalytics, vendorAnalytics, ordersInRange] = await Promise.all([
      this.prisma.dailyGigAnalytics.findMany({
        where: {
          vendorProfileId,
          date: { in: dateStrings },
          ...(gigId ? { gigId } : {}),
        },
      }),
      this.prisma.dailyVendorAnalytics.findMany({
        where: {
          vendorProfileId,
          date: { in: dateStrings },
        },
      }),
      this.prisma.order.findMany({
        where: {
          vendorProfileId,
          createdAt: { gte: startDate },
          ...(gigId ? { gigId } : {}),
        },
        include: {
          disputes: { select: { id: true, status: true } },
        },
      }),
    ]);

    // Aggregate summary metrics
    const totalGigImpressions = gigAnalytics.reduce((acc, row) => acc + (row.impressions || 0), 0);
    const totalGigClicks = gigAnalytics.reduce((acc, row) => acc + (row.clicks || 0), 0);
    const totalGigViews = gigAnalytics.reduce((acc, row) => acc + (row.views || 0), 0);
    const totalProfileViews = vendorAnalytics.reduce((acc, row) => acc + (row.profileViews || 0), 0);

    // Fallback to lifetime if empty to ensure initial experience looks accurate
    const displayImpressions = Math.max(totalGigImpressions, vendor.gigs.reduce((acc, g) => acc + (g.impressionCount || 0), 0));
    const displayClicks = Math.max(totalGigClicks, vendor.gigs.reduce((acc, g) => acc + (g.clickCount || 0), 0));
    const displayViews = Math.max(totalGigViews + totalProfileViews, vendor.gigs.reduce((acc, g) => acc + (g.viewCount || 0), 0) + (vendor.profileViews || 0));

    // Orders breakdown in period
    const totalOrders = ordersInRange.length;
    const completedOrders = ordersInRange.filter(
      (o) => o.status === OrderStatus.COMPLETED || o.status === ('COMPLETED_WITH_PARTIAL_REFUND' as any),
    ).length;
    const cancelledOrders = ordersInRange.filter(
      (o) => o.status === OrderStatus.CANCELLED || o.cancelledAt !== null,
    ).length;
    const disputedOrders = ordersInRange.filter(
      (o) => o.disputes && o.disputes.length > 0,
    ).length;

    const totalEarnings = ordersInRange
      .filter((o) => o.status === OrderStatus.COMPLETED || o.status === ('COMPLETED_WITH_PARTIAL_REFUND' as any))
      .reduce((acc, o) => acc + Number(o.vendorNet || o.amount || 0), 0);

    // Conversion and performance calculations
    const ctr = displayImpressions > 0 ? Number(((displayClicks / displayImpressions) * 100).toFixed(2)) : 0;
    const conversionRate = displayClicks > 0
      ? Number(((completedOrders / displayClicks) * 100).toFixed(2))
      : displayViews > 0
      ? Number(((completedOrders / displayViews) * 100).toFixed(2))
      : 0;

    const completionRate = (completedOrders + cancelledOrders) > 0
      ? Number(((completedOrders / (completedOrders + cancelledOrders)) * 100).toFixed(1))
      : 100;
    const cancellationRatio = totalOrders > 0
      ? Number(((cancelledOrders / totalOrders) * 100).toFixed(1))
      : 0;

    // Daily time series chart data
    const timeSeries = dateStrings.map((dStr) => {
      const gRows = gigAnalytics.filter((r) => r.date === dStr);
      const vRow = vendorAnalytics.find((r) => r.date === dStr);
      const dayOrders = ordersInRange.filter((o) => o.createdAt.toISOString().slice(0, 10) === dStr);

      const dayEarned = dayOrders
        .filter((o) => o.status === OrderStatus.COMPLETED || o.status === ('COMPLETED_WITH_PARTIAL_REFUND' as any))
        .reduce((sum, o) => sum + Number(o.vendorNet || o.amount || 0), 0);

      const dObj = new Date(dStr);
      const formattedDate = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      return {
        date: dStr,
        formattedDate,
        impressions: gRows.reduce((sum, r) => sum + (r.impressions || 0), 0),
        clicks: gRows.reduce((sum, r) => sum + (r.clicks || 0), 0),
        views: gRows.reduce((sum, r) => sum + (r.views || 0), 0) + (vRow?.profileViews || 0),
        orders: dayOrders.length,
        earnings: dayEarned,
      };
    });

    // Gig-wise breakdown
    const gigBreakdown = vendor.gigs.map((g) => {
      const gDaily = gigAnalytics.filter((r) => r.gigId === g.id);
      const gOrders = ordersInRange.filter((o) => o.gigId === g.id);

      const gImps = Math.max(gDaily.reduce((sum, r) => sum + (r.impressions || 0), 0), g.impressionCount || 0);
      const gClks = Math.max(gDaily.reduce((sum, r) => sum + (r.clicks || 0), 0), g.clickCount || 0);
      const gViews = Math.max(gDaily.reduce((sum, r) => sum + (r.views || 0), 0), g.viewCount || 0);
      const gOrderCnt = Math.max(gOrders.length, g.orderCount || 0);
      const gCompleted = gOrders.filter((o) => o.status === OrderStatus.COMPLETED || o.status === ('COMPLETED_WITH_PARTIAL_REFUND' as any)).length;
      const gEarnings = gOrders
        .filter((o) => o.status === OrderStatus.COMPLETED || o.status === ('COMPLETED_WITH_PARTIAL_REFUND' as any))
        .reduce((sum, o) => sum + Number(o.vendorNet || o.amount || 0), 0);

      const gCtr = gImps > 0 ? Number(((gClks / gImps) * 100).toFixed(2)) : 0;
      const gConvRate = gClks > 0
        ? Number(((gCompleted / gClks) * 100).toFixed(2))
        : gViews > 0
        ? Number(((gCompleted / gViews) * 100).toFixed(2))
        : 0;

      const coverImg = g.gallery?.[0]?.url || g.coverImageUrl || 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=300';
      const startingPrice = g.packages?.[0]?.price ? `$${Number(g.packages[0].price).toFixed(0)}` : '$450';

      return {
        id: g.id,
        title: g.title,
        slug: g.slug,
        status: g.status,
        category: g.category?.name || 'Event Service',
        coverImage: coverImg,
        startingPrice,
        impressions: gImps,
        clicks: gClks,
        ctr: gCtr,
        views: gViews,
        orders: gOrderCnt,
        earnings: gEarnings,
        conversionRate: gConvRate,
      };
    });

    return {
      daysCount,
      range: rangeClean,
      summary: {
        profileViews: Math.max(totalProfileViews, vendor.profileViews || 0),
        gigImpressions: displayImpressions,
        gigClicks: displayClicks,
        ctr,
        totalViews: displayViews,
        totalOrders,
        completedOrders,
        cancelledOrders,
        disputedOrders,
        totalEarnings,
        avgOrderValue: completedOrders > 0 ? Math.round(totalEarnings / completedOrders) : 0,
        conversionRate,
        completionRate,
        cancellationRatio,
      },
      timeSeries,
      gigBreakdown,
      rating: Number(vendor.rating || 0),
      onTimeDeliveryPct: vendor.onTimeDeliveryPct || 100,
    };
  }
}
