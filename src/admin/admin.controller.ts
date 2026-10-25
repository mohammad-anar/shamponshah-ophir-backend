import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateVendorStatusDto, UpdateLevelRuleDto, AdminQueryDto } from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, VendorStatus } from '@prisma/client';

@ApiTags('Admin Dashboard & Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform GMV, fees, escrow, and user KPIs (Admin)' })
  getPlatformStats() {
    return this.adminService.getPlatformStats();
  }

  @Get('vendor-approvals')
  @ApiOperation({ summary: 'Get vendor applications pending review (Admin)' })
  getVendorApprovals(@Query('status') status?: VendorStatus) {
    return this.adminService.getVendorApprovals(status);
  }

  @Patch('vendor-approvals/:id')
  @ApiOperation({ summary: 'Approve, reject, or suspend a vendor application (Admin)' })
  updateVendorApproval(
    @Param('id') vendorProfileId: string,
    @Body() dto: UpdateVendorStatusDto,
  ) {
    return this.adminService.updateVendorApproval(vendorProfileId, dto);
  }

  @Get('users')
  @ApiOperation({ summary: 'Get all platform users with roles and profile status (Admin)' })
  getAllUsers(@Query() query: AdminQueryDto) {
    return this.adminService.getAllUsers(query);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Get all platform orders and escrow states (Admin)' })
  getAllOrders(@Query() query: AdminQueryDto) {
    return this.adminService.getAllOrders(query);
  }

  @Get('levels/rules')
  @ApiOperation({ summary: 'Get vendor tier gamification upgrade rules (Admin)' })
  getLevelRules() {
    return this.adminService.getLevelRules();
  }

  @Post('levels/rules')
  @ApiOperation({ summary: 'Configure vendor tier level upgrade criteria (Admin)' })
  updateLevelRule(@Body() dto: UpdateLevelRuleDto) {
    return this.adminService.updateLevelRule(dto);
  }

  @Get('disputes')
  @ApiOperation({ summary: 'Get all platform disputes (Admin)' })
  getAllDisputes() {
    return this.adminService.getAllDisputes();
  }

  @Patch('disputes/:id/resolve')
  @ApiOperation({ summary: 'Arbitrate dispute with Stripe Connect release or refund (Admin)' })
  resolveDispute(@Param('id') id: string, @Body() dto: any) {
    return this.adminService.resolveDispute(id, dto);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Get vendor payout batches & disbursements (Admin)' })
  getPayouts() {
    return this.adminService.getPayouts();
  }

  @Get('fees-reports')
  @ApiOperation({ summary: 'Get ledger of platform fees and revenue (Admin)' })
  getFeesReports() {
    return this.adminService.getFeesReports();
  }

  @Get('reviews-reports')
  @ApiOperation({ summary: 'Get moderation feed for reviews (Admin)' })
  getReviewsReports() {
    return this.adminService.getReviewsReports();
  }

  @Patch('reviews-reports/:id/moderate')
  @ApiOperation({ summary: 'Moderate, publish, or hide review (Admin)' })
  moderateReview(@Param('id') id: string, @Body() body: { action: 'publish' | 'hide' | 'delete' }) {
    return this.adminService.moderateReview(id, body.action);
  }

  @Get('gigs')
  @ApiOperation({ summary: 'Get all platform gigs (Admin)' })
  getAllGigs(@Query() query: AdminQueryDto) {
    return this.adminService.getAllGigs(query);
  }

  @Patch('gigs/:id/status')
  @ApiOperation({ summary: 'Change gig status (Admin)' })
  updateGigStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.adminService.updateGigStatus(id, body.status);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Get all posted jobs (Admin)' })
  getAllJobs(@Query() query: AdminQueryDto) {
    return this.adminService.getAllJobs(query);
  }

  // ── System Governance & Settings ───────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Get platform governance and escrow parameters (Admin)' })
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update platform governance and escrow parameters (Admin)' })
  updateSettings(@Body() body: any) {
    return this.adminService.updateSettings(body);
  }

  // ── Support Tickets Desk ───────────────────────────────────

  @Get('support/tickets')
  @ApiOperation({ summary: 'Get all support tickets desk (Admin)' })
  getSupportTickets() {
    return this.adminService.getSupportTickets();
  }

  @Post('support/tickets/:id/reply')
  @ApiOperation({ summary: 'Reply to support ticket (Admin)' })
  replySupportTicket(@Param('id') id: string, @Body() body: { text: string; sender?: string }) {
    return this.adminService.replySupportTicket(id, body);
  }

  @Patch('support/tickets/:id/status')
  @ApiOperation({ summary: 'Update support ticket status (Admin)' })
  updateSupportTicketStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.adminService.updateSupportTicketStatus(id, body.status);
  }

  // ── Payouts Instant Release ────────────────────────────────

  @Post('payouts/:id/disburse')
  @ApiOperation({ summary: 'Instant ACH disburse payout batch (Admin)' })
  disbursePayout(@Param('id') id: string) {
    return this.adminService.disbursePayout(id);
  }

  // ── Levels Recalculation Engine ────────────────────────────

  @Post('levels/recalculate')
  @ApiOperation({ summary: 'Trigger automated vendor tier progression recalculation (Admin)' })
  recalculateLevels() {
    return this.adminService.recalculateLevels();
  }

  // ── Users Status & Moderation ──────────────────────────────

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Update user status or verification (Admin)' })
  updateUserStatus(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateUserStatus(id, body);
  }

  // ── Single Gig Inspection ──────────────────────────────────

  @Get('gigs/:id')
  @ApiOperation({ summary: 'Get single gig full detail for audit (Admin)' })
  getAdminGigById(@Param('id') id: string) {
    return this.adminService.getAdminGigById(id);
  }

  // ── Single Job Inspection & Award ──────────────────────────

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get single job full detail with bids for inspection (Admin)' })
  getAdminJobById(@Param('id') id: string) {
    return this.adminService.getAdminJobById(id);
  }

  @Post('jobs/:id/offers/:offerId/award')
  @ApiOperation({ summary: 'Manually award job to vendor offer (Admin)' })
  awardJobBid(@Param('id') jobId: string, @Param('offerId') offerId: string) {
    return this.adminService.awardJobBid(jobId, offerId);
  }
}


