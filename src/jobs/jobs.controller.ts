import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobDto, CreateOfferDto, JobQueryDto, AcceptOfferDto } from './dto/job.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Jobs & Offers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // ── CLIENT: RFP Management ─────────────────────────────────

  @Post('user/jobs')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Create a new job/RFP (Client)' })
  createJob(@Req() req: any, @Body() dto: CreateJobDto) {
    return this.jobsService.createJob(req.user?.clientProfileId, dto, req.user?.id || req.user?.sub);
  }

  @Post('user/jobs/:id/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Publish job to receive bids (Client)' })
  publishJob(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.publishJob(id, req.user.clientProfileId);
  }

  @Get('user/jobs')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'List my jobs with received offers (Client)' })
  getClientJobs(@Req() req: any, @Query('status') status?: string) {
    return this.jobsService.getClientJobs(
      req.user?.clientProfileId,
      status,
      req.user?.id || req.user?.sub,
    );
  }

  @Get('user/jobs/:id/offers')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Get all received vendor offers for a job (Client)' })
  getJobOffers(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.getJobOffers(id, req.user.clientProfileId);
  }

  @Get('user/jobs/:id')
  @ApiOperation({ summary: 'Get single job with all offers (Client)' })
  getJobById(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.getJobById(id, req.user.sub);
  }

  @Patch('user/jobs/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Update job (Client)' })
  updateJob(@Param('id') id: string, @Req() req: any, @Body() dto: UpdateJobDto) {
    return this.jobsService.updateJob(id, req.user?.clientProfileId, dto, req.user?.id || req.user?.sub);
  }

  @Post('user/jobs/:jobId/offers/:offerId/accept')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Accept a vendor offer with off-session escrow charge (Client)' })
  acceptOffer(
    @Param('jobId') jobId: string,
    @Param('offerId') offerId: string,
    @Req() req: any,
    @Body() dto?: AcceptOfferDto,
  ) {
    return this.jobsService.acceptOffer(
      jobId,
      offerId,
      req.user?.clientProfileId,
      req.user?.id || req.user?.sub,
      dto?.paymentMethodId,
    );
  }

  @Delete('user/jobs/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Delete a job completely if no offer accepted (Client)' })
  deleteJob(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.deleteJob(id, req.user?.clientProfileId, req.user?.id || req.user?.sub);
  }

  @Post('user/jobs/:id/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Cancel a job (Client)' })
  cancelJobPost(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.cancelJob(id, req.user?.clientProfileId, req.user?.id || req.user?.sub);
  }

  // ── VENDOR: Browse Jobs + Submit Offers ───────────────────

  @Get('vendor/find-jobs')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Browse open jobs matching vendor category (Vendor)' })
  findOpenJobs(@Query() query: JobQueryDto, @Req() req: any) {
    return this.jobsService.findOpenJobs(
      query,
      req.user?.vendorProfileId,
      req.user?.id || req.user?.sub,
    );
  }

  @Post('vendor/jobs/:jobId/offer')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Submit an offer on a job (Vendor, costs 2 bid credits)' })
  submitOffer(@Param('jobId') jobId: string, @Req() req: any, @Body() dto: CreateOfferDto) {
    return this.jobsService.submitOffer(
      jobId,
      req.user?.vendorProfileId,
      dto,
      req.user?.id || req.user?.sub,
    );
  }

  @Get('vendor/offers')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'List my submitted offers (Vendor)' })
  getVendorOffers(@Req() req: any) {
    return this.jobsService.getVendorOffers(req.user.vendorProfileId);
  }

  @Delete('vendor/offers/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Withdraw an offer (Vendor)' })
  withdrawOffer(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.withdrawOffer(id, req.user.vendorProfileId);
  }
}
