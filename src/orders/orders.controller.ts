import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { resolve, basename, extname } from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, ApproveMilestoneDto, DeclineDeliveryDto, SubmitMilestoneDto, CreateReviewDto, CreateDisputeDto, OrderQueryDto, CancelOrderDto, RespondDisputeDto, TransitionOrderDto, RequestRevisionDto, DeliverOrderDto } from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

import { MessagesService } from '../messages/messages.service';

const deliveryUploadDir = resolve(process.cwd(), 'uploads');
if (!fs.existsSync(deliveryUploadDir)) {
  fs.mkdirSync(deliveryUploadDir, { recursive: true });
}

export const ALLOWED_DELIVERY_MIME_TYPES: Record<string, string> = {
  // Images
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  // Videos
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  // Documents & Archives
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
};

export const deliveryStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const targetDir = resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const detectedExt = extname(safeOriginal).toLowerCase();
    const safeExt = ALLOWED_DELIVERY_MIME_TYPES[file.mimetype] || detectedExt || '.bin';
    const randomHex = crypto.randomBytes(16).toString('hex');
    const safeName = `delivery-${Date.now()}-${randomHex}${safeExt}`;
    const resolvedPath = resolve(deliveryUploadDir, safeName);
    if (!resolvedPath.startsWith(deliveryUploadDir)) {
      return cb(new BadRequestException('Invalid file destination detected'), '');
    }
    cb(null, safeName);
  },
});

export const deliveryFileFilter = (_req: any, file: any, cb: any) => {
  if (!ALLOWED_DELIVERY_MIME_TYPES[file.mimetype]) {
    return cb(
      new BadRequestException(
        `File type "${file.mimetype}" is not permitted for delivery deliverables. Allowed formats: Images, Videos, PDFs, ZIP archives, Documents.`,
      ),
      false,
    );
  }
  cb(null, true);
};

@ApiTags('Orders & Escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly messagesService: MessagesService,
  ) {}

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


  @Patch(':id/transition')
  @ApiOperation({ summary: 'Transition order status according to state machine rules' })
  transitionOrder(
    @Param('id') orderId: string,
    @Req() req: any,
    @Body() dto: TransitionOrderDto,
  ) {
    const role = req.user?.role || Role.CLIENT;
    return this.ordersService.transitionOrder(orderId, role, dto);
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
  @Roles(Role.CLIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Client accepts order delivery and triggers 7-day clearing (Client)' })
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

  @Post(':id/request-revision')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Client requests changes on delivered order with mandatory reason (Client)' })
  requestRevision(
    @Param('id') orderId: string,
    @Req() req: any,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.ordersService.requestRevision(
      orderId,
      req.user?.clientProfileId,
      dto,
      req.user?.id || req.user?.sub,
    );
  }

  @Post(':id/decline-delivery')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT, Role.ADMIN)
  @ApiOperation({ summary: 'Client declines delivery and requests revision (Client) - alias' })
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
  @Roles(Role.VENDOR, Role.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: deliveryStorage,
      fileFilter: deliveryFileFilter,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
    }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Vendor delivers full order with required deliverables and message (Vendor)' })
  deliverOrder(
    @Param('id') orderId: string,
    @Req() req: any,
    @Body() body: any,
    @UploadedFiles() files?: any[],
  ) {
    return this.ordersService.deliverOrderWithFiles(
      orderId,
      req.user?.vendorProfileId,
      body,
      files,
      req.user?.id || req.user?.sub,
      req.user?.role,
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

  // ── ORDER CHAT REST ENDPOINTS ──────────────────────────────

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get paginated chat messages for active order' })
  getOrderMessages(
    @Param('id') orderId: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const role = req.user?.role;
    return this.messagesService.getOrderMessages(orderId, userId, role, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      before,
    });
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message in active order chat' })
  sendOrderMessage(
    @Param('id') orderId: string,
    @Req() req: any,
    @Body() dto: { content?: string; attachments?: string[] },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const role = req.user?.role;
    return this.messagesService.sendOrderMessage(orderId, userId, role, dto);
  }

  @Patch(':id/messages/read')
  @ApiOperation({ summary: 'Mark messages in active order chat as read' })
  markOrderMessagesAsRead(@Param('id') orderId: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.messagesService.markOrderMessagesAsRead(orderId, userId);
  }
}

