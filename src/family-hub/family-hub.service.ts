import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagesService } from '../messages/messages.service';
import {
  CreateFamilyBoardDto,
  AddBoardItemDto,
  VoteBoardItemDto,
  InviteMemberDto,
  UpdateBoardItemDto,
  BookBoardItemDto,
} from './dto/family-hub.dto';
import {
  OrderStatus,
  MilestoneStatus,
  PaymentStatus,
  TransactionType,
  NotificationType,
} from '@prisma/client';

@Injectable()
export class FamilyHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly messagesService: MessagesService,
  ) {}

  async getOrCreateWorkspace(clientProfileId?: string, userId?: string) {
    // If clientProfileId is missing but userId is present, find or create the ClientProfile
    if (!clientProfileId && userId) {
      let profile = await this.prisma.clientProfile.findUnique({ where: { userId } });
      if (!profile) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        profile = await this.prisma.clientProfile.create({
          data: {
            userId,
            displayName: user?.email ? user.email.split('@')[0] : 'Client Collaborator',
          },
        });
      }
      clientProfileId = profile.id;
    }

    if (!clientProfileId) {
      throw new BadRequestException('Client profile ID is required');
    }

    const selectMembersAndBoards = {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              clientProfile: {
                select: { displayName: true, avatarUrl: true },
              },
            },
          },
        },
      },
      owner: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      },
      boards: {
        include: {
          items: true,
        },
        orderBy: { createdAt: 'desc' as const },
      },
    };

    // First try finding workspace where this client is the owner
    let workspace = await this.prisma.familyWorkspace.findUnique({
      where: { ownerId: clientProfileId },
      include: selectMembersAndBoards,
    });

    // If not found and userId is present, check if user is an invited member of another workspace
    if (!workspace && userId) {
      const membership = await this.prisma.familyMember.findFirst({
        where: { userId },
        include: {
          familyWorkspace: {
            include: selectMembersAndBoards,
          },
        },
      });
      if (membership?.familyWorkspace) {
        workspace = membership.familyWorkspace;
      }
    }

    // If still no workspace, create one for this client
    if (!workspace) {
      workspace = await this.prisma.familyWorkspace.create({
        data: {
          ownerId: clientProfileId,
          name: 'Family Collaboration Hub',
        },
        include: selectMembersAndBoards,
      });
    }

    // Ensure there is always at least one primary board
    let primaryBoard = workspace.boards[0];
    if (!primaryBoard) {
      primaryBoard = await this.prisma.familyBoard.create({
        data: {
          familyWorkspaceId: workspace.id,
          title: 'Celebration Planning Board',
          notes: 'Collaborative board for family and vendor coordination',
        },
        include: { items: true },
      });
      workspace.boards = [primaryBoard];
    }

    return workspace;
  }

  async createBoard(clientProfileId: string, dto: CreateFamilyBoardDto, userId?: string) {
    const ws = await this.getOrCreateWorkspace(clientProfileId, userId);

    return this.prisma.familyBoard.create({
      data: {
        familyWorkspaceId: ws.id,
        title: dto.title,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : null,
        notes: dto.notes,
      },
      include: { items: true },
    });
  }

  async addBoardItem(clientProfileId?: string, boardId?: string, dto: AddBoardItemDto = {} as any, userId?: string) {
    let targetBoardId = boardId;

    // If no boardId provided or requesting primary/default, resolve the primary board
    if (!targetBoardId || targetBoardId === 'primary' || targetBoardId === 'default') {
      const ws = await this.getOrCreateWorkspace(clientProfileId, userId);
      targetBoardId = ws.boards[0]?.id;
    }

    if (!targetBoardId) {
      throw new NotFoundException('No active family board found');
    }

    const board = await this.prisma.familyBoard.findUnique({
      where: { id: targetBoardId },
      include: {
        familyWorkspace: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!board) {
      // If specified board was deleted or invalid, fallback to workspace primary board
      const ws = await this.getOrCreateWorkspace(clientProfileId, userId);
      targetBoardId = ws.boards[0]?.id;
    } else {
      // Permission check: must be owner or workspace member
      const isOwner = clientProfileId && board.familyWorkspace.ownerId === clientProfileId;
      const isMember = userId && board.familyWorkspace.members.some((m) => m.userId === userId);
      if (!isOwner && !isMember) {
        throw new BadRequestException('Unauthorized to add items to this workspace');
      }
    }

    // Duplicate check: ensure this service isn't already recommended on the board
    const trimmedTitle = dto.title ? dto.title.trim() : '';
    const existing = await this.prisma.familyBoardItem.findFirst({
      where: {
        boardId: targetBoardId,
        OR: [
          ...(dto.gigId ? [{ gigId: dto.gigId }] : []),
          ...(trimmedTitle ? [{ title: { equals: trimmedTitle, mode: 'insensitive' as const } }] : []),
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('This service has already been added to your Family Hub');
    }

    return this.prisma.familyBoardItem.create({
      data: {
        boardId: targetBoardId,
        vendorId: dto.vendorId || null,
        gigId: dto.gigId || null,
        title: trimmedTitle,
        notes: dto.notes,
        status: dto.status || 'SHORTLISTED',
        votes: {},
      },
    });
  }

  async voteItem(itemId: string, userId: string, dto: VoteBoardItemDto) {
    const item = await this.prisma.familyBoardItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Board item not found');

    const votes = (item.votes as Record<string, string>) || {};
    votes[userId] = dto.vote;

    return this.prisma.familyBoardItem.update({
      where: { id: itemId },
      data: { votes },
    });
  }

  async updateBoardItem(clientProfileId: string, itemId: string, dto: UpdateBoardItemDto) {
    const item = await this.prisma.familyBoardItem.findUnique({
      where: { id: itemId },
      include: { board: { include: { familyWorkspace: true } } },
    });
    if (!item) throw new NotFoundException('Board item not found');
    if (item.board.familyWorkspace.ownerId !== clientProfileId) {
      throw new ForbiddenException('Only the workspace owner can update this board item');
    }

    let updatedNotes = item.notes;
    if (dto.notes !== undefined) {
      updatedNotes = dto.notes;
    }

    return this.prisma.familyBoardItem.update({
      where: { id: itemId },
      data: {
        status: dto.status || undefined,
        notes: updatedNotes,
      },
    });
  }

  async bookBoardItem(clientProfileId: string, itemId: string, dto: BookBoardItemDto) {
    throw new BadRequestException('Family Hub bookings must be paid through the Stripe checkout flow before an order can start.');
    const item = await this.prisma.familyBoardItem.findUnique({
      where: { id: itemId },
      include: {
        board: {
          include: {
            familyWorkspace: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Board item not found');
    }

    let parsedNotes: any = {};
    try {
      parsedNotes = JSON.parse(item.notes || '{}');
    } catch {
      parsedNotes = { originalNote: item.notes };
    }

    const price = Number(parsedNotes.price || 1200);
    const platformFee = Math.round(price * 0.05 * 100) / 100;
    const grandTotal = Math.round((price + platformFee) * 100) / 100;

    let vendorProfileId = item.vendorId;
    if (!vendorProfileId) {
      const defaultVendor = await this.prisma.vendorProfile.findFirst();
      vendorProfileId = defaultVendor?.id;
    }

    if (!vendorProfileId) {
      throw new BadRequestException('No vendor profile found for this item');
    }

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

    // Create Order with Milestones and Transaction in Database
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        clientProfileId,
        vendorProfileId,
        gigId: item.gigId || undefined,
        status: OrderStatus.ACTIVE,
        subtotal: price,
        platformFee: platformFee,
        grandTotal: grandTotal,
        deliveryNotes: dto.note || `Booked and 100% paid via Family Planning Hub by ${dto.payerName || 'Client'}`,
        milestones: {
          create: [
            {
              label: 'Initial Booking & Reservation Deposit',
              percentage: 50,
              amount: Math.round(price * 0.5 * 100) / 100,
              status: MilestoneStatus.RELEASED,
              note: 'Funded into escrow and released upon booking confirmation',
            },
            {
              label: 'Final Celebration Service Delivery',
              percentage: 50,
              amount: Math.round(price * 0.5 * 100) / 100,
              status: MilestoneStatus.LOCKED,
              note: 'Secured in Stripe Escrow, released after event completion',
            },
          ],
        },
        transactions: {
          create: [
            {
              txRef: `TX-ESC-${Date.now().toString().slice(-8)}`,
              clientProfileId,
              vendorProfileId,
              type: TransactionType.ESCROW_DEPOSIT,
              amount: grandTotal,
              fee: platformFee,
              net: price,
              status: PaymentStatus.SUCCEEDED,
              description: `100% Escrow deposit for "${item.title}" via Family Hub`,
            },
          ],
        },
      },
      include: {
        milestones: true,
        transactions: true,
      },
    });

    // Update FamilyBoardItem status and notes
    parsedNotes.amountPaid = price;
    parsedNotes.orderId = order.id;
    parsedNotes.orderNumber = order.orderNumber;
    parsedNotes.payerName = dto.payerName || 'Client';
    parsedNotes.bookedAt = new Date().toISOString();

    const updatedItem = await this.prisma.familyBoardItem.update({
      where: { id: itemId },
      data: {
        status: 'BOOKED',
        notes: JSON.stringify(parsedNotes),
      },
    });

    // Notify Vendor
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      include: { user: true },
    });

    if (vendor) {
      await this.notifications.createNotification({
        userId: vendor.userId,
        type: NotificationType.ORDER_PLACED,
        title: 'New Celebration Service Booked!',
        body: `Your service "${item.title}" was booked via Family Hub for $${price.toLocaleString()}. Escrow funds secured.`,
        link: `/vendor/orders/${order.id}`,
      });

      // Send automated message in conversation
      try {
        const clientUser = await this.prisma.clientProfile.findUnique({
          where: { id: clientProfileId },
          include: { user: true },
        });

        if (clientUser) {
          await this.messagesService.startConversation(clientUser.userId, {
            recipientUserId: vendor.userId,
            orderId: order.id,
            initialMessage: `Hi! I have booked and fully paid for "${item.title}" ($${price.toLocaleString()}) via our Family Planning Hub. The funds are now securely held in Stripe Escrow. Looking forward to working together!`,
          });
        }
      } catch (err) {
        console.error('Auto conversation creation note:', err);
      }
    }

    return {
      success: true,
      message: 'Service booked and escrow funds deposited successfully',
      order,
      item: updatedItem,
    };
  }

  async deleteBoardItem(clientProfileId: string, itemId: string) {
    const item = await this.prisma.familyBoardItem.findUnique({
      where: { id: itemId },
      include: { board: { include: { familyWorkspace: true } } },
    });
    if (!item) throw new NotFoundException('Item not found');
    if (item.board.familyWorkspace.ownerId !== clientProfileId) {
      throw new ForbiddenException('Only the workspace owner can remove this board item');
    }

    await this.prisma.familyBoardItem.delete({ where: { id: itemId } });
    return { message: 'Board item deleted' };
  }

  async inviteMember(clientProfileId: string, dto: InviteMemberDto) {
    const ws = await this.getOrCreateWorkspace(clientProfileId);

    const invitedUser = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!invitedUser) {
      throw new NotFoundException('No account exists for this email yet. The invitation was not sent.');
    }

    const existing = await this.prisma.familyMember.findUnique({
      where: {
        familyWorkspaceId_userId: {
          familyWorkspaceId: ws.id,
          userId: invitedUser.id,
        },
      },
    });

    if (existing) {
      return { message: 'Member is already part of this workspace' };
    }

    const member = await this.prisma.familyMember.create({
      data: {
        familyWorkspaceId: ws.id,
        userId: invitedUser.id,
        role: dto.role || 'COLLABORATOR',
        inviteEmail: dto.email,
        joinedAt: new Date(),
      },
    });

    return { message: 'Member added to workspace', member };
  }

  async removeMember(clientProfileId: string, memberId: string) {
    const workspace = await this.getOrCreateWorkspace(clientProfileId);
    const member = await this.prisma.familyMember.findFirst({
      where: { id: memberId, familyWorkspaceId: workspace.id },
    });
    if (!member) throw new NotFoundException('Family member not found');
    await this.prisma.familyMember.delete({ where: { id: member.id } });
    return { message: 'Family member removed' };
  }
}
