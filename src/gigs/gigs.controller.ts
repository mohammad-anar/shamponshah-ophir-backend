import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GigsService } from './gigs.service';
import { CreateGigDto, UpdateGigDto, CreateGigPackageDto, GigQueryDto } from './dto/gig.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Gigs')
@Controller()
export class GigsController {
  constructor(private readonly gigsService: GigsService) {}

  // ── PUBLIC ─────────────────────────────────────────────────

  @Get('gigs')
  @ApiOperation({ summary: 'Browse all active gigs (public)' })
  findAll(@Query() query: GigQueryDto) {
    return this.gigsService.findAllPublic(query);
  }

  @Get('gigs/:slug')
  @ApiOperation({ summary: 'Get single gig by slug (public)' })
  findOne(@Param('slug') slug: string) {
    return this.gigsService.findOne(slug);
  }

  // ── VENDOR: Gig CRUD ───────────────────────────────────────

  @Post('vendor/gigs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Create a new gig (Vendor)' })
  create(@Req() req: any, @Body() dto: CreateGigDto) {
    return this.gigsService.create(req.user.vendorProfileId, dto);
  }

  @Get('vendor/gigs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'List my gigs (Vendor)' })
  getMyGigs(@Req() req: any) {
    return this.gigsService.findVendorGigs(req.user.vendorProfileId);
  }

  @Patch('vendor/gigs/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Update gig (Vendor)' })
  update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateGigDto) {
    return this.gigsService.update(id, req.user.vendorProfileId, dto);
  }

  @Delete('vendor/gigs/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Archive gig (Vendor)' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.gigsService.remove(id, req.user.vendorProfileId);
  }

  // ── VENDOR: Packages ───────────────────────────────────────

  @Post('vendor/gig-packages')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Add package to gig (Vendor)' })
  createPackage(@Req() req: any, @Body() dto: CreateGigPackageDto) {
    return this.gigsService.createPackage(req.user.vendorProfileId, dto);
  }

  @Patch('vendor/gig-packages/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Update gig package (Vendor)' })
  updatePackage(@Param('id') id: string, @Req() req: any, @Body() dto: Partial<CreateGigPackageDto>) {
    return this.gigsService.updatePackage(id, req.user.vendorProfileId, dto);
  }

  @Delete('vendor/gig-packages/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Delete gig package (Vendor)' })
  deletePackage(@Param('id') id: string, @Req() req: any) {
    return this.gigsService.deletePackage(id, req.user.vendorProfileId);
  }
}
