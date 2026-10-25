import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
}
