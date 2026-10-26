import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'Hello! Can we discuss specific dietary requirements for the event?' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ type: [String], example: ['https://example.com/menu.pdf'] })
  @IsOptional()
  @IsArray()
  attachments?: string[];
}

export class StartConversationDto {
  @ApiPropertyOptional({ example: 'clx...participantUserId' })
  @IsOptional()
  @IsString()
  recipientUserId?: string;

  @ApiPropertyOptional({ example: 'clx...orderId' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ example: 'Initial message' })
  @IsOptional()
  @IsString()
  initialMessage?: string;
}

export class SendOrderMessageDto {
  @ApiPropertyOptional({ example: 'Hello! I have uploaded the draft for review.' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: [String], example: ['https://example.com/uploads/photo.jpg'] })
  @IsOptional()
  @IsArray()
  attachments?: string[];
}
