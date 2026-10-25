import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, ApproveMilestoneDto, DeclineDeliveryDto, SubmitMilestoneDto, CreateReviewDto, CreateDisputeDto, OrderQueryDto, CancelOrderDto, RespondDisputeDto } from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Orders & Escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Create order (gig booking or accepted offer) (Client)' })
  create(@Req() req: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(req.user.clientProfileId, dto);
  }

  @Get('client')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'List all client orders (Client)' })
  getClientOrders(@Req() req: any, @Query() query: OrderQueryDto) {
    return this.ordersService.getClientOrders(req.user.clientProfileId, query);
  }

  @Get('vendor')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'List all vendor orders (Vendor)' })
  getVendorOrders(@Req() req: any, @Query() query: OrderQueryDto) {
    return this.ordersService.getVendorOrders(
      req.user?.vendorProfileId,
      query,
      req.user?.id || req.user?.sub,
    );
  }

  @Get('payments/ledger')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Get escrow ledger and payment history (Client)' })
  getPaymentLedger(@Req() req: any) {
    return this.ordersService.getPaymentLedger(req.user.clientProfileId);
  }

  @Get('disputes/client')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'List client disputes (Client)' })
  getClientDisputes(@Req() req: any) {
    return this.ordersService.getClientDisputes(req.user.clientProfileId);
  }

  @Get('disputes/vendor')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'List vendor disputes (Vendor)' })
  getVendorDisputes(@Req() req: any) {
    return this.ordersService.getVendorDisputes(req.user.vendorProfileId);
  }

  @Post('disputes/:id/respond')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor responds to a dispute with statement/evidence (Vendor)' })
  respondToDispute(
    @Param('id') disputeId: string,
    @Req() req: any,
    @Body() dto: RespondDisputeDto,
  ) {
    return this.ordersService.respondToDispute(disputeId, req.user.vendorProfileId, dto, req.user.id || req.user.sub);
  }

  @Post('disputes/:id/accept-refund')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor accepts dispute resolution / refund to client (Vendor)' })
  acceptDisputeRefund(
    @Param('id') disputeId: string,
    @Req() req: any,
  ) {
    return this.ordersService.acceptDisputeRefund(disputeId, req.user.vendorProfileId);
  }

  @Post(':id/dispute')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Open dispute on order (Client)' })
  createDispute(@Param('id') orderId: string, @Req() req: any, @Body() dto: CreateDisputeDto) {
    return this.ordersService.createDispute(orderId, req.user.clientProfileId, dto);
  }


  @Get(':id')
  @ApiOperation({ summary: 'Get single order detail' })
  getOrder(@Param('id') id: string, @Req() req: any) {
    return this.ordersService.getOrderById(id, req.user?.id || req.user?.sub);
  }

  @Post(':id/milestones/:milestoneId/approve')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Approve milestone and trigger Stripe transfer to vendor (Client)' })
  approveMilestone(
    @Param('id') orderId: string,
    @Param('milestoneId') milestoneId: string,
    @Req() req: any,
    @Body() dto: ApproveMilestoneDto,
  ) {
    return this.ordersService.approveMilestone(orderId, milestoneId, req.user?.clientProfileId, dto, req.user?.id || req.user?.sub);
  }

  @Post(':id/accept-delivery')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Client accepts order delivery and approves all remaining milestones (Client)' })
  acceptDelivery(
    @Param('id') orderId: string,
    @Req() req: any,
    @Body() dto: ApproveMilestoneDto,
  ) {
    return this.ordersService.acceptDelivery(
      orderId,
      req.user?.clientProfileId,
      dto,
      req.user?.id || req.user?.sub,
    );
  }

  @Post(':id/decline-delivery')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Client declines delivery and requests revision (Client)' })
  declineDelivery(
    @Param('id') orderId: string,
    @Req() req: any,
    @Body() dto: DeclineDeliveryDto,
  ) {
    return this.ordersService.declineDelivery(
      orderId,
      req.user?.clientProfileId,
      dto,
      req.user?.id || req.user?.sub,
    );
  }

  @Post(':id/milestones/:milestoneId/submit')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor submits proof/work for milestone completion (Vendor)' })
  submitMilestone(
    @Param('id') orderId: string,
    @Param('milestoneId') milestoneId: string,
    @Req() req: any,
    @Body() dto: SubmitMilestoneDto,
  ) {
    return this.ordersService.submitMilestone(
      orderId,
      milestoneId,
      req.user?.vendorProfileId,
      dto,
      req.user?.id || req.user?.sub,
    );
  }

  @Post(':id/deliver')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor delivers full order or milestone deliverables (Vendor)' })
  deliverOrder(
    @Param('id') orderId: string,
    @Req() req: any,
    @Body() dto: SubmitMilestoneDto,
  ) {
    return this.ordersService.deliverOrder(
      orderId,
      req.user?.vendorProfileId,
      dto,
      req.user?.id || req.user?.sub,
    );
  }

  @Post(':id/review')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Submit review for completed order (Client)' })
  createReview(@Param('id') orderId: string, @Req() req: any, @Body() dto: CreateReviewDto) {
    return this.ordersService.createReview(orderId, req.user.clientProfileId, dto);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Cancel order or submit cancellation request (Client)' })
  cancelOrder(@Param('id') orderId: string, @Req() req: any, @Body() dto: CancelOrderDto) {
    return this.ordersService.cancelOrder(
      orderId,
      req.user?.clientProfileId,
      dto,
      req.user?.id || req.user?.sub,
    );
  }
}

