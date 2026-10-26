import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SendMessageDto, StartConversationDto } from './dto/message.dto';
import { NotificationType, Role, OrderStatus } from '@prisma/client';
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => MessagesGateway))
    private readonly messagesGateway: MessagesGateway,
  ) {}

  async getUserConversations(userId: string) {
    if (!userId) return [];
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    role: true,
                    clientProfile: { select: { displayName: true, avatarUrl: true } },
                    vendorProfile: { select: { id: true, businessName: true, avatarUrl: true } },
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    return Promise.all(participants.map(async (p) => {
      const conv = p.conversation;
      const peer = conv.participants.find((part) => part.userId !== userId)?.user;
      const peerName = peer?.role === 'VENDOR' ? peer?.vendorProfile?.businessName : peer?.clientProfile?.displayName;
      const peerAvatar = peer?.role === 'VENDOR' ? peer?.vendorProfile?.avatarUrl : peer?.clientProfile?.avatarUrl;

      const unreadCount = await this.prisma.message.count({
        where: { conversationId: conv.id, senderId: { not: userId }, isRead: false },
      });

      return {
        id: conv.id,
        orderId: conv.orderId,
        updatedAt: conv.updatedAt,
        peer: {
          id: peer?.id,
          vendorProfileId: peer?.vendorProfile?.id,
          name: peerName || peer?.email,
          avatarUrl: peerAvatar,
          role: peer?.role,
        },
        otherParticipant: {
          id: peer?.id,
          vendorProfileId: peer?.vendorProfile?.id,
          name: peerName || peer?.email,
          avatarUrl: peerAvatar,
          role: peer?.role,
        },
        unreadCount,
        lastMessage: conv.messages[0] || null,
      };
    }));
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    pagination?: { page?: number; limit?: number; before?: string },
  ) {
    const isParticipant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!isParticipant) throw new ForbiddenException('Not a participant in this conversation');

    // Mark incoming messages as read
    await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, isRead: false },
      data: { isRead: true },
    });

    const page = pagination?.page && pagination.page > 0 ? Number(pagination.page) : 1;
    const limit = pagination?.limit && pagination.limit > 0 ? Math.min(Number(pagination.limit), 50) : 20;
    const skip = (page - 1) * limit;

    const where: any = { conversationId };
    if (pagination?.before) {
      where.createdAt = { lt: new Date(pagination.before) };
    }

    const totalCount = await this.prisma.message.count({ where });

    // Order by createdAt desc so skip skips the newest messages and fetches older ones
    const messagesDesc = await this.prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            role: true,
            clientProfile: { select: { displayName: true, avatarUrl: true } },
            vendorProfile: { select: { businessName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Reverse to chronological order (oldest to newest) for chat stream rendering
    const messages = messagesDesc.reverse();

    const formattedMessages = messages.map((m) => {
      const senderName = m.sender.role === 'VENDOR' ? m.sender.vendorProfile?.businessName : m.sender.clientProfile?.displayName;
      const senderAvatar = m.sender.role === 'VENDOR' ? m.sender.vendorProfile?.avatarUrl : m.sender.clientProfile?.avatarUrl;

      return {
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        content: m.content,
        attachments: m.attachments,
        isRead: m.isRead,
        createdAt: m.createdAt,
        isMe: m.senderId === userId,
        senderName: senderName || m.sender.email,
        senderAvatar,
      };
    });

    return {
      messages: formattedMessages,
      page,
      limit,
      totalCount,
      hasMore: skip + messagesDesc.length < totalCount,
    };
  }

  async sendMessage(conversationId: string, senderId: string, dto: SendMessageDto) {
    const isParticipant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } },
    });
    if (!isParticipant) throw new ForbiddenException('Not a participant in this conversation');

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: dto.content,
        attachments: dto.attachments || [],
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Notify other participant
    const others = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: senderId } },
    });

    for (const other of others) {
      await this.notifications.createNotification({
        userId: other.userId,
        type: NotificationType.MESSAGE_RECEIVED,
        title: 'New Message Received',
        body: dto.content.slice(0, 80),
        link: `/user/messages?conv=${conversationId}`,
      });
    }

    this.messagesGateway.emitNewMessage(conversationId, {
      id: message.id,
      conversationId,
      senderId,
      content: message.content,
      attachments: message.attachments,
      createdAt: message.createdAt,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    return message;
  }

  async startConversation(senderId: string, dto: StartConversationDto) {
    let targetUserId = dto.recipientUserId;

    if (dto.recipientUserId) {
      // 1. Check if passed recipientUserId is a vendorProfile
      const vendorProfile = await this.prisma.vendorProfile.findFirst({
        where: {
          OR: [
            { id: dto.recipientUserId },
            { userId: dto.recipientUserId },
          ],
        },
      });

      if (vendorProfile) {
        targetUserId = vendorProfile.userId;
      } else {
        // 2. Check if passed recipientUserId is a clientProfile
        const clientProfile = await this.prisma.clientProfile.findFirst({
          where: {
            OR: [
              { id: dto.recipientUserId },
              { userId: dto.recipientUserId },
            ],
          },
        });

        if (clientProfile) {
          targetUserId = clientProfile.userId;
        } else {
          const user = await this.prisma.user.findUnique({ where: { id: dto.recipientUserId } });
          if (user) {
            targetUserId = user.id;
          }
        }
      }
    }

    // 3. Fallback to order participants if orderId is provided
    if (!targetUserId && dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        include: { clientProfile: true, vendorProfile: true },
      });
      if (order) {
        targetUserId = order.vendorProfile?.userId === senderId
          ? order.clientProfile?.userId
          : order.vendorProfile?.userId;
      }
    }

    if (!targetUserId) {
      const fallbackUser = await this.prisma.user.findFirst({
        where: { id: { not: senderId } },
      });
      if (fallbackUser) {
        targetUserId = fallbackUser.id;
      } else {
        throw new NotFoundException('Recipient user not found');
      }
    }

    // Check if conversation already exists between these 2 users
    const existing = await this.prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: senderId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                clientProfile: { select: { displayName: true, avatarUrl: true } },
                vendorProfile: { select: { id: true, businessName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });

    if (existing) {
      if (dto.initialMessage) {
        await this.sendMessage(existing.id, senderId, { content: dto.initialMessage });
      }
      return existing;
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        orderId: dto.orderId,
        participants: {
          create: [{ userId: senderId }, { userId: targetUserId }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                clientProfile: { select: { displayName: true, avatarUrl: true } },
                vendorProfile: { select: { id: true, businessName: true, avatarUrl: true } },
              },
            },
          },
        },
      },
    });

    if (dto.initialMessage) {
      await this.sendMessage(conversation.id, senderId, { content: dto.initialMessage });
    }
    return conversation;
  }

  // ── ORDER CHAT METHODS ───────────────────────────────────────

  async verifyOrderAccess(orderId: string, userId: string, role?: Role) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        clientProfile: { select: { userId: true, displayName: true } },
        vendorProfile: { select: { userId: true, businessName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.PENDING_PAYMENT) {
      throw new ForbiddenException('Order is unpaid. Chat unlocks once escrow payment is confirmed.');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new ForbiddenException('Order has been cancelled.');
    }

    const isClient = order.clientProfile?.userId === userId;
    const isVendor = order.vendorProfile?.userId === userId;
    const isAdminDisputed = role === Role.ADMIN && order.status === OrderStatus.DISPUTED;

    if (!isClient && !isVendor && !isAdminDisputed) {
      throw new ForbiddenException(
        'Unauthorized: Only the assigned client, vendor, or an admin during an active dispute can access this order chat.',
      );
    }

    return order;
  }

  async getOrderMessages(
    orderId: string,
    userId: string,
    role?: Role,
    pagination?: { page?: number; limit?: number; before?: string },
  ) {
    await this.verifyOrderAccess(orderId, userId, role);

    const conversation = await this.prisma.conversation.findFirst({
      where: { orderId },
      include: { participants: true },
    });

    if (!conversation) {
      return {
        messages: [],
        pagination: {
          page: 1,
          limit: pagination?.limit || 20,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
      };
    }

    // Auto mark other participant's messages as read
    await this.prisma.message
      .updateMany({
        where: { conversationId: conversation.id, senderId: { not: userId }, isRead: false },
        data: { isRead: true },
      })
      .catch(() => null);

    const page = pagination?.page && pagination.page > 0 ? Number(pagination.page) : 1;
    const limit = pagination?.limit && pagination.limit > 0 ? Math.min(Number(pagination.limit), 50) : 20;
    const skip = (page - 1) * limit;

    const where: any = { conversationId: conversation.id };
    if (pagination?.before) {
      where.createdAt = { lt: new Date(pagination.before) };
    }

    const total = await this.prisma.message.count({ where });
    const messagesDesc = await this.prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            role: true,
            clientProfile: { select: { displayName: true, avatarUrl: true } },
            vendorProfile: { select: { businessName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const messages = messagesDesc.reverse().map((msg) => {
      const senderName =
        msg.sender.role === Role.VENDOR
          ? msg.sender.vendorProfile?.businessName || 'Vendor'
          : msg.sender.clientProfile?.displayName || 'Client';
      const senderAvatar =
        msg.sender.role === Role.VENDOR
          ? msg.sender.vendorProfile?.avatarUrl
          : msg.sender.clientProfile?.avatarUrl;

      return {
        id: msg.id,
        orderId,
        conversationId: conversation.id,
        senderId: msg.senderId,
        senderName,
        senderAvatar,
        senderRole: msg.sender.role,
        content: msg.content,
        attachments: msg.attachments || [],
        isRead: msg.isRead,
        createdAt: msg.createdAt.toISOString(),
        time: msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      messages,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: skip + messagesDesc.length < total,
      },
    };
  }

  async sendOrderMessage(
    orderId: string,
    userId: string,
    role?: Role,
    dto?: { content?: string; attachments?: string[] },
  ) {
    const order = await this.verifyOrderAccess(orderId, userId, role);

    if (!dto?.content?.trim() && (!dto?.attachments || dto.attachments.length === 0)) {
      throw new BadRequestException('Message content or attachments required');
    }

    let conversation = await this.prisma.conversation.findFirst({
      where: { orderId },
      include: { participants: true },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          orderId,
          participants: {
            create: [
              { userId: order.clientProfile!.userId },
              { userId: order.vendorProfile!.userId },
            ],
          },
        },
        include: { participants: true },
      });
    }

    const msg = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        content: (dto.content || '').trim(),
        attachments: dto.attachments || [],
        isRead: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            role: true,
            clientProfile: { select: { displayName: true, avatarUrl: true } },
            vendorProfile: { select: { businessName: true, avatarUrl: true } },
          },
        },
      },
    });

    await this.prisma.conversation
      .update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })
      .catch(() => null);

    const senderName =
      msg.sender.role === Role.VENDOR
        ? msg.sender.vendorProfile?.businessName || 'Vendor'
        : msg.sender.clientProfile?.displayName || 'Client';
    const senderAvatar =
      msg.sender.role === Role.VENDOR
        ? msg.sender.vendorProfile?.avatarUrl
        : msg.sender.clientProfile?.avatarUrl;

    const payload = {
      id: msg.id,
      orderId,
      conversationId: conversation.id,
      senderId: msg.senderId,
      senderName,
      senderAvatar,
      senderRole: msg.sender.role,
      content: msg.content,
      attachments: msg.attachments || [],
      isRead: msg.isRead,
      createdAt: msg.createdAt.toISOString(),
      time: msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Realtime broadcast to socket room order:{orderId}
    this.messagesGateway.emitNewOrderMessage(orderId, payload);

    return payload;
  }

  async markOrderMessagesAsRead(orderId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { orderId },
    });
    if (!conversation) return { count: 0 };

    const updateRes = await this.prisma.message.updateMany({
      where: { conversationId: conversation.id, senderId: { not: userId }, isRead: false },
      data: { isRead: true },
    });

    await this.prisma.conversationParticipant
      .updateMany({
        where: { conversationId: conversation.id, userId },
        data: { lastReadAt: new Date() },
      })
      .catch(() => null);

    if (this.messagesGateway?.server) {
      this.messagesGateway.server.to(`order:${orderId}`).emit('order_messages_read', {
        orderId,
        readerId: userId,
        readAt: new Date().toISOString(),
      });
    }

    return { count: updateRes.count };
  }
}
