import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { ReplyReviewDto, ReviewQueryDto } from './dto/review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('client')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Get submitted and pending reviews for logged in client (Client)' })
  getClientReviews(@Req() req: any) {
    return this.reviewsService.getClientReviews(req.user.clientProfileId);
  }

  @Get('vendor/:vendorId')
  @ApiOperation({ summary: 'Get paginated reviews for a vendor (Public)' })
  getVendorReviews(@Param('vendorId') vendorId: string, @Query() query: ReviewQueryDto) {
    return this.reviewsService.getVendorReviews(vendorId, query);
  }

  @Get('gig/:gigId')
  @ApiOperation({ summary: 'Get paginated reviews for a gig (Public)' })
  getGigReviews(@Param('gigId') gigId: string, @Query() query: ReviewQueryDto) {
    return this.reviewsService.getGigReviews(gigId, query);
  }


  @Patch(':id/reply')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor replies to a review (Vendor)' })
  replyToReview(@Param('id') reviewId: string, @Req() req: any, @Body() dto: ReplyReviewDto) {
    return this.reviewsService.replyToReview(reviewId, req.user.vendorProfileId, dto);
  }
}
