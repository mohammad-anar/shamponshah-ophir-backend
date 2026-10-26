import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateCategoryDto, CreateSubCategoryDto, UpdateCategoryDto } from './dto/category.dto';

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
        children: {
          where: { isActive: true },
          orderBy: [{ order: 'asc' }, { sortOrder: 'asc' }],
        },
        subCategories: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { gigs: true, vendorCategories: true, jobs: true } },
      },
      orderBy: [{ order: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    await this.redis.setJson(this.CACHE_KEY, categories, this.TTL);
    return categories;
  }

  async findAllForAdmin() {
    return this.prisma.category.findMany({
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          orderBy: [{ order: 'asc' }, { sortOrder: 'asc' }],
        },
        subCategories: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { gigs: true, jobs: true, vendorCategories: true } },
      },
      orderBy: [{ order: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        children: { where: { isActive: true } },
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

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    const sortOrderVal = dto.order !== undefined ? dto.order : (dto.sortOrder || 0);

    const created = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        icon: dto.icon,
        image: dto.image,
        sortOrder: sortOrderVal,
        order: sortOrderVal,
        parentId: dto.parentId,
      },
    });
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

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException('Category slug already exists');
    }

    if (dto.parentId) {
      if (dto.parentId === category.id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.image !== undefined) updateData.image = dto.image;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.order !== undefined) {
      updateData.order = dto.order;
      updateData.sortOrder = dto.order;
    } else if (dto.sortOrder !== undefined) {
      updateData.sortOrder = dto.sortOrder;
      updateData.order = dto.sortOrder;
    }
    if (dto.parentId !== undefined) updateData.parentId = dto.parentId;

    const updated = await this.prisma.category.update({
      where: { id: category.id },
      data: updateData,
    });
    await this.redis.del(this.CACHE_KEY);
    return updated;
  }

  async remove(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        _count: {
          select: { gigs: true, jobs: true, children: true },
        },
      },
    });
    if (!category) throw new NotFoundException('Category not found');

    const gigCount = category._count.gigs;
    const jobCount = category._count.jobs;
    const childrenCount = category._count.children;

    if (gigCount > 0 || jobCount > 0) {
      throw new BadRequestException(
        `Cannot delete category: it is currently used by ${gigCount} gig(s) and ${jobCount} job(s). Please deactivate it instead.`
      );
    }

    if (childrenCount > 0) {
      throw new BadRequestException(
        `Cannot delete category: it has ${childrenCount} subcategories. Please reassign or delete subcategories first.`
      );
    }

    const deleted = await this.prisma.category.delete({
      where: { id: category.id },
    });
    await this.redis.del(this.CACHE_KEY);
    return deleted;
  }
}

