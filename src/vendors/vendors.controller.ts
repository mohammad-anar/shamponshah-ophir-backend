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

  // ── Public Endpoints ───────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Browse and search vendor directory with filters (Public)' })
  search(@Query() query: VendorQueryDto) {
    return this.vendorsService.searchVendors(query);
  }

  @Get('profile/:slug')
  @ApiOperation({ summary: 'Get public vendor profile by slug with gigs, portfolio, reviews (Public)' })
  getBySlug(@Param('slug') slug: string) {
    return this.vendorsService.getVendorBySlug(slug);
  }

  // ── Client: Saved Vendors ──────────────────────────────────

  @Get('saved/list')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Get client bookmarked/saved vendors (Client)' })
  getSavedVendors(@Req() req: any) {
    return this.vendorsService.getSavedVendors(req.user.sub);
  }

  @Post(':id/save')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Toggle save/bookmark vendor (Client)' })
  toggleSaveVendor(@Param('id') vendorId: string, @Req() req: any) {
    return this.vendorsService.toggleSaveVendor(req.user.sub, vendorId);
  }

  // ── Vendor Endpoints (Protected) ───────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get current vendor profile & settings (Vendor)' })
  getMyProfile(@Req() req: any) {
    return this.vendorsService.getMyProfile(req.user.vendorProfileId);
  }

  @Post('onboarding')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Submit vendor 7-step onboarding data (Vendor)' })
  submitOnboarding(@Req() req: any, @Body() dto: VendorOnboardingDto) {
    return this.vendorsService.submitOnboarding(req.user.vendorProfileId, dto);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Update vendor profile info & categories (Vendor)' })
  updateProfile(@Req() req: any, @Body() dto: UpdateVendorProfileDto) {
    return this.vendorsService.updateProfile(req.user.vendorProfileId, dto);
  }

  @Get('analytics')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get comprehensive performance analytics for vendor dashboard (Vendor)' })
  getAnalytics(
    @Req() req: any,
    @Query('range') range?: string,
    @Query('timeframe') timeframe?: string,
  ) {
    return this.vendorsService.getVendorAnalytics(req.user.vendorProfileId, range || timeframe);
  }

  @Post('vacation')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Toggle vacation mode (Vendor)' })
  toggleVacation(@Req() req: any, @Body() dto: ToggleVacationModeDto) {
    return this.vendorsService.toggleVacationMode(req.user.vendorProfileId, dto);
  }

  @Get('calendar/blocked-dates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get vendor blocked dates (Vendor)' })
  getBlockedDates(@Req() req: any) {
    return this.vendorsService.getBlockedDates(req.user.vendorProfileId);
  }

  @Post('calendar/blocked-dates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Add a date to blocked dates (Vendor)' })
  addBlockedDate(@Req() req: any, @Body() dto: CreateBlockedDateDto) {
    return this.vendorsService.addBlockedDate(req.user.vendorProfileId, dto);
  }

  @Delete('calendar/blocked-dates/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Remove a date from blocked dates (Vendor)' })
  removeBlockedDate(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.removeBlockedDate(req.user.vendorProfileId, id);
  }

  @Post('portfolio')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Add an item to vendor portfolio (Vendor)' })
  addPortfolioItem(@Req() req: any, @Body() dto: CreatePortfolioItemDto) {
    return this.vendorsService.addPortfolioItem(req.user.vendorProfileId, dto);
  }

  @Delete('portfolio/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Delete a portfolio item (Vendor)' })
  deletePortfolioItem(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.deletePortfolioItem(req.user.vendorProfileId, id);
  }
}
