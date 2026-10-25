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
import { Logger } from '@nestjs/common';

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

  handleConnection(client: Socket) {
    this.logger.log(`⚡ WebSocket client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`❌ WebSocket client disconnected: ${client.id}`);
  }

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

    // Broadcast only to other clients in room, avoiding echoing back to sender
    client.to(data.conversationId).emit('new_message', payload);
    return payload;
  }

  emitNewMessage(conversationId: string, messagePayload: any) {
    if (this.server) {
      this.server.to(conversationId).emit('new_message', messagePayload);
    }
  }
}
