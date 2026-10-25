import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReplyReviewDto, ReviewQueryDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getVendorReviews(vendorProfileId: string, query: ReviewQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { vendorProfileId, isPublished: true },
        include: {
          clientProfile: { select: { displayName: true, avatarUrl: true } },
          order: { select: { orderNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({
        where: { vendorProfileId, isPublished: true },
      }),
    ]);

    return {
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getGigReviews(gigId: string, query: ReviewQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { gigId, isPublished: true },
        include: {
          clientProfile: { select: { displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({
        where: { gigId, isPublished: true },
      }),
    ]);

    return {
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async replyToReview(reviewId: string, vendorProfileId: string, dto: ReplyReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.vendorProfileId !== vendorProfileId) {
      throw new ForbiddenException('You can only reply to reviews on your profile');
    }

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        vendorReply: dto.reply,
        repliedAt: new Date(),
      },
    });
  }

  async getClientReviews(clientProfileId: string) {
    const [submittedRaw, completedOrders] = await Promise.all([
      this.prisma.review.findMany({
        where: { clientProfileId },
        include: {
          vendorProfile: {
            select: {
              id: true,
              businessName: true,
              avatarUrl: true,
              user: { select: { email: true } },
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              gig: { select: { title: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.findMany({
        where: {
          clientProfileId,
          status: 'COMPLETED',
        },
        include: {
          vendorProfile: {
            select: {
              id: true,
              businessName: true,
              avatarUrl: true,
              user: { select: { email: true } },
            },
          },
          gig: {
            select: {
              title: true,
              category: { select: { name: true } },
            },
          },
          orderReviews: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const submitted = submittedRaw.map((r: any) => ({
      id: r.id,
      orderId: r.order?.orderNumber || r.orderId,
      vendorName: r.vendorProfile?.businessName || 'Artisan Vendor',
      serviceTitle: r.order?.gig?.title || r.title || 'Event Service',
      avatar: (r.vendorProfile?.businessName || 'AV').slice(0, 2).toUpperCase(),
      rating: r.rating,
      date: new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      comment: r.comment,
      responseFromVendor: r.vendorReply || undefined,
    }));

    const pending = completedOrders
      .filter((o: any) => o.orderReviews.length === 0)
      .map((o: any) => ({
        id: o.id,
        orderId: o.orderNumber,
        vendorName: o.vendorProfile?.businessName || 'Vendor',
        serviceTitle: o.gig?.title || 'Event Service Milestone',
        category: o.gig?.category?.name || 'Specialty Service',
        avatar: (o.vendorProfile?.businessName || 'VN').slice(0, 2).toUpperCase(),
        completedDate: new Date(o.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        amount: Number(o.grandTotal),
      }));

    return { submitted, pending };
  }
}


