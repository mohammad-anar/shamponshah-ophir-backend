import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateCategoryDto, CreateSubCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  private readonly CACHE_KEY = 'categories:all';
  private readonly TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll() {
    const cached = await this.redis.getJson<any[]>(this.CACHE_KEY);
    if (cached) return cached;

    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: {
        subCategories: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { gigs: true, vendorCategories: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    await this.redis.setJson(this.CACHE_KEY, categories, this.TTL);
    return categories;
  }

  async findBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        subCategories: { orderBy: { sortOrder: 'asc' } },
        gigs: {
          where: { status: 'ACTIVE' },
          include: {
            vendorProfile: {
              select: { businessName: true, rating: true, avatarUrl: true, city: true, state: true },
            },
            packages: true,
          },
          take: 20,
        },
      },
    });

    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('Category slug already exists');

    const created = await this.prisma.category.create({ data: dto });
    await this.redis.del(this.CACHE_KEY);
    return created;
  }

  async createSubCategory(categoryId: string, dto: CreateSubCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Parent category not found');

    const sub = await this.prisma.subCategory.create({
      data: { ...dto, categoryId },
    });
    await this.redis.del(this.CACHE_KEY);
    return sub;
  }

  async update(id: string, dto: any) {
    const category = await this.prisma.category.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!category) throw new NotFoundException('Category not found');

    const updated = await this.prisma.category.update({
      where: { id: category.id },
      data: dto,
    });
    await this.redis.del(this.CACHE_KEY);
    return updated;
  }

  async remove(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!category) throw new NotFoundException('Category not found');

    // Soft-delete or archive
    const deleted = await this.prisma.category.update({
      where: { id: category.id },
      data: { isActive: false },
    });
    await this.redis.del(this.CACHE_KEY);
    return deleted;
  }
}

