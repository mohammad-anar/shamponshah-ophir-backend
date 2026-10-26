import { 
  Body, 
  Controller, 
  Get, 
  Ip, 
  Post, 
  Query, 
  Req, 
  UseGuards, 
  Headers 
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { TrackBatchDto, VendorAnalyticsQueryDto } from './dto/track-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('track')
  @ApiOperation({ summary: 'Record tracking events (impressions, clicks, views) with deduplication & rate limiting' })
  async trackEvents(
    @Body() dto: TrackBatchDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.analyticsService.trackEvents(dto, ip, userAgent);
  }

  @Get('vendor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VENDOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Fiverr-style comprehensive vendor performance analytics (impressions, clicks, CTR, conversions, earnings)' })
  async getVendorAnalytics(
    @Req() req: any,
    @Query() query: VendorAnalyticsQueryDto,
  ) {
    const userId = req.user.id || req.user.userId;
    const vendorProfile = await this.prisma.vendorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!vendorProfile) {
      return {
        summary: {
          profileViews: 0,
          gigImpressions: 0,
          gigClicks: 0,
          ctr: 0,
          totalViews: 0,
          totalOrders: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          disputedOrders: 0,
          totalEarnings: 0,
          avgOrderValue: 0,
          conversionRate: 0,
          completionRate: 100,
          cancellationRatio: 0,
        },
        timeSeries: [],
        gigBreakdown: [],
      };
    }

    return this.analyticsService.getVendorAnalytics(vendorProfile.id, query.range, query.gigId);
  }
}
