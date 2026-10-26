import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { SendMessageDto, StartConversationDto } from './dto/message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Messages & Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Get all user conversations with peer info and last message' })
  getUserConversations(@Req() req: any, @Query('userId') queryUserId?: string) {
    const targetUserId = queryUserId || req.user?.id || req.user?.sub;
    return this.messagesService.getUserConversations(targetUserId);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get messages for a conversation and mark as read' })
  getConversationMessages(
    @Param('id') conversationId: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.messagesService.getConversationMessages(
      conversationId,
      req.user?.id || req.user?.sub,
      {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        before,
      },
    );
  }

  @Post('conversations/:id')
  @ApiOperation({ summary: 'Send message in a conversation' })
  sendMessage(
    @Param('id') conversationId: string,
    @Req() req: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(conversationId, req.user?.id || req.user?.sub, dto);
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Start a new conversation with a user' })
  startConversation(@Req() req: any, @Body() dto: StartConversationDto) {
    return this.messagesService.startConversation(req.user?.id || req.user?.sub, dto);
  }

  // ── ORDER CHAT REST ENDPOINTS ──────────────────────────────

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get paginated messages for an active order chat room' })
  getOrderMessages(
    @Param('orderId') orderId: string,
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

  @Post('order/:orderId')
  @ApiOperation({ summary: 'Send a message in active order chat room' })
  sendOrderMessage(
    @Param('orderId') orderId: string,
    @Req() req: any,
    @Body() dto: { content?: string; attachments?: string[] },
  ) {
    const userId = req.user?.id || req.user?.sub;
    const role = req.user?.role;
    return this.messagesService.sendOrderMessage(orderId, userId, role, dto);
  }

  @Patch('order/:orderId/read')
  @ApiOperation({ summary: 'Mark all incoming messages in order chat as read' })
  markOrderMessagesAsRead(@Param('orderId') orderId: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.messagesService.markOrderMessagesAsRead(orderId, userId);
  }
}
