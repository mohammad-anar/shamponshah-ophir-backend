import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import {
  VendorOnboardingDto,
  UpdateVendorProfileDto,
  ToggleVacationModeDto,
  CreateBlockedDateDto,
  CreatePortfolioItemDto,
  VendorQueryDto,
} from './dto/vendor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Vendors & Directory')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  private async resolveVendorProfileId(user: any): Promise<string> {
    if (user?.vendorProfileId) return user.vendorProfileId;
    const userId = user?.id || user?.sub;
    if (!userId) return '';
    const vp = await this.vendorsService.getOrCreateVendorProfile(userId, user?.email);
    return vp?.id || '';
  }

  // ── Public Endpoints ───────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Browse and search vendor directory with filters (Public)' })
  search(@Query() query: VendorQueryDto) {
    return this.vendorsService.searchVendors(query);
  }

  @Get('showcase')
  @ApiOperation({ summary: 'Get public portfolio items & event media for home page showcase (Public)' })
  getShowcase() {
    return this.vendorsService.getShowcase();
  }

  @Get('profile/:slug')
  @ApiOperation({ summary: 'Get public vendor profile by slug with gigs, portfolio, reviews (Public)' })
  getBySlug(@Param('slug') slug: string) {
    return this.vendorsService.getVendorBySlug(slug);
  }

  // ── Client: Saved Vendors ──────────────────────────────────

  @Get('saved/list')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get client bookmarked/saved vendors (Client)' })
  getSavedVendors(@Req() req: any) {
    return this.vendorsService.getSavedVendors(req.user.sub || req.user.id);
  }

  @Post(':id/save')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Toggle save/bookmark vendor (Client)' })
  toggleSaveVendor(@Param('id') vendorId: string, @Req() req: any) {
    return this.vendorsService.toggleSaveVendor(req.user.sub || req.user.id, vendorId);
  }

  // ── Vendor Endpoints (Protected) ───────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current vendor profile & settings (Vendor)' })
  async getMyProfile(@Req() req: any) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.getMyProfile(vendorProfileId);
  }

  @Post('onboarding')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit vendor 7-step onboarding data (Vendor)' })
  async submitOnboarding(@Req() req: any, @Body() dto: VendorOnboardingDto) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.submitOnboarding(vendorProfileId, dto);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update vendor profile info & categories (Vendor)' })
  async updateProfile(@Req() req: any, @Body() dto: UpdateVendorProfileDto) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.updateProfile(vendorProfileId, dto);
  }

  @Get('analytics')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get comprehensive performance analytics for vendor dashboard (Vendor)' })
  async getAnalytics(
    @Req() req: any,
    @Query('range') range?: string,
    @Query('timeframe') timeframe?: string,
  ) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.getVendorAnalytics(vendorProfileId, range || timeframe);
  }

  @Post('vacation')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Toggle vacation mode (Vendor)' })
  async toggleVacation(@Req() req: any, @Body() dto: ToggleVacationModeDto) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.toggleVacationMode(vendorProfileId, dto);
  }

  @Get('calendar/blocked-dates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get vendor blocked dates (Vendor)' })
  async getBlockedDates(@Req() req: any) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.getBlockedDates(vendorProfileId);
  }

  @Post('calendar/blocked-dates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add a date to blocked dates (Vendor)' })
  async addBlockedDate(@Req() req: any, @Body() dto: CreateBlockedDateDto) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.addBlockedDate(vendorProfileId, dto);
  }

  @Delete('calendar/blocked-dates/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Remove a date from blocked dates (Vendor)' })
  async removeBlockedDate(@Req() req: any, @Param('id') id: string) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.removeBlockedDate(vendorProfileId, id);
  }

  @Post('portfolio')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add an item to vendor portfolio (Vendor)' })
  async addPortfolioItem(@Req() req: any, @Body() dto: CreatePortfolioItemDto) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.addPortfolioItem(vendorProfileId, dto);
  }

  @Delete('portfolio/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a portfolio item (Vendor)' })
  async deletePortfolioItem(@Req() req: any, @Param('id') id: string) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.vendorsService.deletePortfolioItem(vendorProfileId, id);
  }
}
