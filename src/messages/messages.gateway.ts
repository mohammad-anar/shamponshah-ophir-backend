import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from './messages.service';
import { Role, OrderStatus } from '@prisma/client';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`⚡ WebSocket client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ WebSocket client disconnected: ${client.id}`);
  }

  // ── Emit notification to order room ────────────────────────
  notifyOrderRoom(orderId: string, event: string, payload: any) {
    try {
      if (this.server) {
        this.server.to(`order:${orderId}`).emit(event, payload);
        this.logger.log(`Broadcasted "${event}" to room order:${orderId}`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not broadcast "${event}" to room order:${orderId}: ${err?.message || err}`);
    }
  }

  // ── Token extraction helper ───────────────────────────────
  extractUser(client: Socket, providedToken?: string): { userId: string; role: Role } | null {
    const rawToken =
      providedToken ||
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization ||
      (client.handshake.query?.token as string);

    if (!rawToken) return null;
    const cleanToken = rawToken.replace(/^Bearer\s+/i, '').trim();

    try {
      const secret = this.config.get('JWT_ACCESS_SECRET');
      const payload: any = this.jwtService.verify(cleanToken, { secret });
      return {
        userId: payload.sub || payload.id,
        role: payload.role as Role,
      };
    } catch {
      return null;
    }
  }

  // ── Order Chat Authorization Verification ──────────────────
  async verifyOrderChatAccess(orderId: string, user: { userId: string; role: Role }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        clientProfile: { select: { userId: true, displayName: true } },
        vendorProfile: { select: { userId: true, businessName: true } },
      },
    });

    if (!order) {
      return { allowed: false, reason: 'Order not found' };
    }

    if (order.status === OrderStatus.PENDING_PAYMENT) {
      return { allowed: false, reason: 'Order is unpaid. Chat unlocks once escrow payment is confirmed.' };
    }

    if (order.status === OrderStatus.CANCELLED) {
      return { allowed: false, reason: 'This order was cancelled. Chat room is closed.' };
    }

    const isClient = order.clientProfile?.userId === user.userId;
    const isVendor = order.vendorProfile?.userId === user.userId;
    const isAdminDisputed = user.role === Role.ADMIN && order.status === OrderStatus.DISPUTED;

    if (!isClient && !isVendor && !isAdminDisputed) {
      return {
        allowed: false,
        reason: 'Unauthorized: Only the assigned client, vendor, or an admin during an active dispute can access this order chat.',
      };
    }

    return { allowed: true, order, isClient, isVendor, isAdmin: isAdminDisputed };
  }

  // ── ORDER CHAT ROOM: order:{orderId} ───────────────────────

  @SubscribeMessage('join_order_chat')
  async handleJoinOrderChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; token?: string },
  ) {
    if (!data?.orderId) {
      return { success: false, error: 'orderId is required' };
    }

    const user = this.extractUser(client, data.token);
    if (!user) {
      client.emit('order_chat_error', { orderId: data.orderId, message: 'Authentication token required to join order chat' });
      return { success: false, error: 'Authentication required' };
    }

    const access = await this.verifyOrderChatAccess(data.orderId, user);
    if (!access.allowed) {
      this.logger.warn(`Join rejected for user ${user.userId} (${user.role}) on order ${data.orderId}: ${access.reason}`);
      client.emit('order_chat_error', { orderId: data.orderId, message: access.reason });
      return { success: false, error: access.reason };
    }

    const room = `order:${data.orderId}`;
    client.join(room);
    this.logger.log(`⚡ Authorized user ${user.userId} (${user.role}) joined socket room: ${room}`);

    // Ensure conversation exists in DB for this order
    const order = access.order!;
    let conversation = await this.prisma.conversation.findFirst({
      where: { orderId: data.orderId },
    });
    if (!conversation && order.clientProfile?.userId && order.vendorProfile?.userId) {
      conversation = await this.prisma.conversation.create({
        data: {
          orderId: data.orderId,
          participants: {
            create: [
              { userId: order.clientProfile.userId },
              { userId: order.vendorProfile.userId },
            ],
          },
        },
      });
    }

    client.emit('joined_order_chat', {
      success: true,
      orderId: data.orderId,
      room,
      conversationId: conversation?.id,
    });

    return { success: true, room, conversationId: conversation?.id };
  }

  @SubscribeMessage('leave_order_chat')
  handleLeaveOrderChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    if (data?.orderId) {
      const room = `order:${data.orderId}`;
      client.leave(room);
      this.logger.log(`Client ${client.id} left socket room: ${room}`);
      return { success: true, room };
    }
  }

  @SubscribeMessage('send_order_message')
  async handleSendOrderMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      orderId: string;
      content?: string;
      attachments?: string[];
      token?: string;
    },
  ) {
    if (!data?.orderId) return;
    const user = this.extractUser(client, data.token);
    if (!user) {
      client.emit('order_chat_error', { orderId: data.orderId, message: 'Authentication required' });
      return;
    }

    const access = await this.verifyOrderChatAccess(data.orderId, user);
    if (!access.allowed) {
      client.emit('order_chat_error', { orderId: data.orderId, message: access.reason });
      return;
    }

    if (!data.content?.trim() && (!data.attachments || data.attachments.length === 0)) {
      client.emit('order_chat_error', { orderId: data.orderId, message: 'Message text or attachment is required' });
      return;
    }

    try {
      const saved = await this.messagesService.sendOrderMessage(data.orderId, user.userId, user.role, {
        content: data.content,
        attachments: data.attachments,
      });
      return saved;
    } catch (err: any) {
      client.emit('order_chat_error', { orderId: data.orderId, message: err?.message || 'Failed to send message' });
    }
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; userName?: string; token?: string },
  ) {
    if (!data?.orderId) return;
    const user = this.extractUser(client, data.token);
    const room = `order:${data.orderId}`;
    client.to(room).emit('user_typing', {
      orderId: data.orderId,
      userId: user?.userId || client.id,
      userName: data.userName,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; token?: string },
  ) {
    if (!data?.orderId) return;
    const user = this.extractUser(client, data.token);
    const room = `order:${data.orderId}`;
    client.to(room).emit('user_typing', {
      orderId: data.orderId,
      userId: user?.userId || client.id,
      isTyping: false,
    });
  }

  @SubscribeMessage('mark_order_messages_read')
  async handleMarkOrderMessagesRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; token?: string },
  ) {
    if (!data?.orderId) return;
    const user = this.extractUser(client, data.token);
    if (!user) return;

    try {
      await this.messagesService.markOrderMessagesAsRead(data.orderId, user.userId);
    } catch (err) {
      this.logger.warn(`Failed to mark messages read for order ${data.orderId}:`, err);
    }
  }

  // ── Legacy Generic Conversation Handlers ──────────────────

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (data?.conversationId) {
      client.join(data.conversationId);
      this.logger.log(`Client ${client.id} joined conversation room: ${data.conversationId}`);
      return { status: 'joined', conversationId: data.conversationId };
    }
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    if (data?.conversationId) {
      client.leave(data.conversationId);
      this.logger.log(`Client ${client.id} left conversation room: ${data.conversationId}`);
      return { status: 'left', conversationId: data.conversationId };
    }
  }

  @SubscribeMessage('send_message')
  handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      content: string;
      senderId?: string;
      senderName?: string;
      senderAvatar?: string;
      time?: string;
    },
  ) {
    if (!data?.conversationId || !data?.content) return;

    const payload = {
      id: `msg-${Date.now()}`,
      conversationId: data.conversationId,
      content: data.content,
      senderId: data.senderId,
      senderName: data.senderName || 'You',
      senderAvatar: data.senderAvatar || 'ME',
      createdAt: new Date().toISOString(),
      time: data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    client.to(data.conversationId).emit('new_message', payload);
    return payload;
  }

  emitNewMessage(conversationId: string, messagePayload: any) {
    if (this.server) {
      this.server.to(conversationId).emit('new_message', messagePayload);
    }
  }

  emitNewOrderMessage(orderId: string, messagePayload: any) {
    if (this.server) {
      this.server.to(`order:${orderId}`).emit('new_order_message', messagePayload);
    }
  }
}
