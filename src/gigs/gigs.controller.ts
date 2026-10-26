import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GigsService } from './gigs.service';
import { CreateGigDto, UpdateGigDto, CreateGigPackageDto, GigQueryDto, ReportGigDto } from './dto/gig.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Gigs')
@Controller()
export class GigsController {
  constructor(private readonly gigsService: GigsService) {}

  private async resolveVendorProfileId(user: any): Promise<string> {
    if (user?.vendorProfileId) return user.vendorProfileId;
    const userId = user?.id || user?.sub;
    if (!userId) return '';
    const vp = await this.gigsService.getOrCreateVendorProfile(userId, user?.email);
    return vp?.id || '';
  }

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

  @Post('gigs/:id/report')
  @ApiOperation({ summary: 'Submit a report/grievance against a service gig' })
  async reportGig(
    @Param('id') gigId: string,
    @Req() req: any,
    @Body() dto: ReportGigDto,
  ) {
    const reporterId = req?.user?.id || req?.user?.sub || null;
    return this.gigsService.reportGig(gigId, reporterId, dto);
  }

  // ── VENDOR: Gig CRUD ───────────────────────────────────────

  @Post('vendor/gigs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new gig (Vendor)' })
  async create(@Req() req: any, @Body() dto: CreateGigDto) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.gigsService.create(vendorProfileId, dto);
  }

  @Get('vendor/gigs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List my gigs (Vendor)' })
  async getMyGigs(@Req() req: any) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.gigsService.findVendorGigs(vendorProfileId);
  }

  @Patch('vendor/gigs/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update gig (Vendor)' })
  async update(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateGigDto) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.gigsService.update(id, vendorProfileId, dto);
  }

  @Delete('vendor/gigs/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Archive gig (Vendor)' })
  async remove(@Param('id') id: string, @Req() req: any) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.gigsService.remove(id, vendorProfileId);
  }

  // ── VENDOR: Packages ───────────────────────────────────────

  @Post('vendor/gig-packages')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add package to gig (Vendor)' })
  async createPackage(@Req() req: any, @Body() dto: CreateGigPackageDto) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.gigsService.createPackage(vendorProfileId, dto);
  }

  @Patch('vendor/gig-packages/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update gig package (Vendor)' })
  async updatePackage(@Param('id') id: string, @Req() req: any, @Body() dto: Partial<CreateGigPackageDto>) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.gigsService.updatePackage(id, vendorProfileId, dto);
  }

  @Delete('vendor/gig-packages/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete gig package (Vendor)' })
  async deletePackage(@Param('id') id: string, @Req() req: any) {
    const vendorProfileId = await this.resolveVendorProfileId(req.user);
    return this.gigsService.deletePackage(id, vendorProfileId);
  }
}
