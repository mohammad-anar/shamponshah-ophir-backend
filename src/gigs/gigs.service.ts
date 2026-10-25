import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateGigDto, UpdateGigDto, CreateGigPackageDto, GigQueryDto } from './dto/gig.dto';
import { GigStatus } from '@prisma/client';

@Injectable()
export class GigsService {
  private readonly CACHE_TTL = 600; // 10 min

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(vendorProfileId: string, dto: CreateGigDto) {
    let catId = (dto as any).categoryId;
    if (!catId && (dto as any).category) {
      const cat = await this.prisma.category.findFirst({
        where: {
          OR: [
            { name: { contains: (dto as any).category, mode: 'insensitive' } },
            { slug: { contains: this.toSlug((dto as any).category), mode: 'insensitive' } },
          ],
        },
      });
      catId = cat?.id;
    }
    if (!catId) {
      const fallbackCat = await this.prisma.category.findFirst();
      catId = fallbackCat?.id;
    }

    const { packages, category, ...gigFields } = dto as any;
    const slug = this.toSlug(dto.title);

    const gig = await this.prisma.gig.create({
      data: {
        ...gigFields,
        categoryId: catId,
        vendorProfileId,
        slug,
        status: GigStatus.ACTIVE,
      },
    });

    if (packages && Array.isArray(packages) && packages.length > 0) {
      for (let i = 0; i < packages.length; i++) {
        const p = packages[i];
        await this.prisma.gigPackage.create({
          data: {
            gigId: gig.id,
            vendorProfileId,
            title: p.name || p.title || `Tier ${i + 1}`,
            description: p.description || 'Full coverage with sound and event coordination',
            price: Number(p.price) || 450,
            turnaround: p.turnaroundDays ? `${p.turnaroundDays} days` : '3 days',
            sortOrder: i,
            isPopular: i === 1,
            features: ['Full equipment setup', 'Guaranteed milestone escrow safety', 'Vetted professional craft'],
          },
        });
      }
    }

    await this.prisma.gigGalleryItem.create({
      data: {
        gigId: gig.id,
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
        sortOrder: 0,
      },
    });

    await this.redis.delPattern('gigs:list:*');
    return gig;
  }

  async findAllPublic(query: GigQueryDto) {
    const cacheKey = `gigs:list:${JSON.stringify(query)}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const { page = 1, limit = 12, search, categoryId, minPrice, maxPrice } = query;
    const skip = (page - 1) * limit;

    const where: any = { status: GigStatus.ACTIVE };
    if (categoryId) where.categoryId = categoryId;
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
    if (minPrice || maxPrice) {
      where.packages = {
        some: {
          price: { gte: minPrice, lte: maxPrice },
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.gig.findMany({
        where,
        skip,
        take: limit,
        include: {
          vendorProfile: { select: { businessName: true, slug: true, rating: true, avatarUrl: true, tier: true } },
          category: { select: { name: true, slug: true } },
          packages: { orderBy: { sortOrder: 'asc' }, take: 1 },
          _count: { select: { gigReviews: true } },
        },
        orderBy: { orderCount: 'desc' },
      }),
      this.prisma.gig.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await this.redis.setJson(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async findOne(slugOrId: string) {
    const cacheKey = `gig:${slugOrId}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const gig = await this.prisma.gig.findFirst({
      where: {
        OR: [{ slug: slugOrId }, { id: slugOrId }],
      },
      include: {
        vendorProfile: {
          include: { categories: { include: { category: true } } },
        },
        category: true,
        packages: { orderBy: { sortOrder: 'asc' } },
        gallery: { orderBy: { sortOrder: 'asc' } },
        gigReviews: {
          include: { clientProfile: { select: { displayName: true, avatarUrl: true } } },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!gig) throw new NotFoundException('Service not found');

    // Increment view count
    await this.prisma.gig.update({ where: { id: gig.id }, data: { viewCount: { increment: 1 } } });

    await this.redis.setJson(cacheKey, gig, this.CACHE_TTL);
    return gig;
  }

  async findVendorGigs(vendorProfileId: string) {
    return this.prisma.gig.findMany({
      where: { vendorProfileId },
      include: {
        packages: { orderBy: { sortOrder: 'asc' } },
        category: true,
        _count: { select: { orders: true, gigReviews: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(gigId: string, vendorProfileId: string, dto: UpdateGigDto) {
    const gig = await this.prisma.gig.findUnique({ where: { id: gigId } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.vendorProfileId !== vendorProfileId) throw new ForbiddenException();

    const updated = await this.prisma.gig.update({ where: { id: gigId }, data: dto });
    await this.redis.del(`gig:${gig.slug}`);
    await this.redis.delPattern('gigs:list:*');
    return updated;
  }

  async remove(gigId: string, vendorProfileId: string) {
    const gig = await this.prisma.gig.findUnique({ where: { id: gigId } });
    if (!gig) throw new NotFoundException('Gig not found');
    if (gig.vendorProfileId !== vendorProfileId) throw new ForbiddenException();

    await this.prisma.gig.update({ where: { id: gigId }, data: { status: GigStatus.ARCHIVED } });
    await this.redis.del(`gig:${gig.slug}`);
    await this.redis.delPattern('gigs:list:*');
    return { message: 'Gig archived' };
  }

  async createPackage(vendorProfileId: string, dto: CreateGigPackageDto) {
    return this.prisma.gigPackage.create({
      data: { ...dto, vendorProfileId },
    });
  }

  async updatePackage(packageId: string, vendorProfileId: string, data: Partial<CreateGigPackageDto>) {
    const pkg = await this.prisma.gigPackage.findUnique({ where: { id: packageId } });
    if (!pkg || pkg.vendorProfileId !== vendorProfileId) throw new ForbiddenException();
    return this.prisma.gigPackage.update({ where: { id: packageId }, data });
  }

  async deletePackage(packageId: string, vendorProfileId: string) {
    const pkg = await this.prisma.gigPackage.findUnique({ where: { id: packageId } });
    if (!pkg || pkg.vendorProfileId !== vendorProfileId) throw new ForbiddenException();
    return this.prisma.gigPackage.delete({ where: { id: packageId } });
  }

  private toSlug(title: string) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
  }
}
