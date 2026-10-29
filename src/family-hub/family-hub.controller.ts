import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FamilyHubService } from './family-hub.service';
import {
  CreateFamilyBoardDto,
  AddBoardItemDto,
  VoteBoardItemDto,
  InviteMemberDto,
  UpdateBoardItemDto,
  BookBoardItemDto,
} from './dto/family-hub.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Collaboration Hub (Client Workspace)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLIENT)
@Controller(['family-hub', 'collaboration'])
export class FamilyHubController {
  constructor(private readonly familyHubService: FamilyHubService) {}

  @Get()
  @ApiOperation({ summary: 'Get or create client family collaboration workspace (Client)' })
  getWorkspace(@Req() req: any) {
    return this.familyHubService.getOrCreateWorkspace(req.user.clientProfileId, req.user.id || req.user.sub);
  }

  @Post('boards')
  @ApiOperation({ summary: 'Create new board in family workspace (Client)' })
  createBoard(@Req() req: any, @Body() dto: CreateFamilyBoardDto) {
    return this.familyHubService.createBoard(req.user.clientProfileId, dto, req.user.id || req.user.sub);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add vendor or gig item directly to primary family board (Client)' })
  addPrimaryBoardItem(@Req() req: any, @Body() dto: AddBoardItemDto) {
    return this.familyHubService.addBoardItem(req.user.clientProfileId, 'primary', dto, req.user.id || req.user.sub);
  }

  @Post('boards/:id/items')
  @ApiOperation({ summary: 'Add vendor or gig item to family board (Client)' })
  addBoardItem(@Param('id') boardId: string, @Req() req: any, @Body() dto: AddBoardItemDto) {
    return this.familyHubService.addBoardItem(req.user.clientProfileId, boardId, dto, req.user.id || req.user.sub);
  }

  @Post('items/:id/vote')
  @ApiOperation({ summary: 'Cast vote on board item (Client / Family Member)' })
  voteItem(@Param('id') itemId: string, @Req() req: any, @Body() dto: VoteBoardItemDto) {
    return this.familyHubService.voteItem(itemId, req.user.sub, dto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove item from board (Client)' })
  deleteItem(@Param('id') itemId: string, @Req() req: any) {
    return this.familyHubService.deleteBoardItem(req.user.clientProfileId, itemId);
  }

  @Delete('members/:id')
  @ApiOperation({ summary: 'Remove a family member from the current workspace (Client)' })
  removeMember(@Param('id') memberId: string, @Req() req: any) {
    return this.familyHubService.removeMember(req.user.clientProfileId, memberId);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update item or assign to event (Client)' })
  updateItem(@Param('id') itemId: string, @Req() req: any, @Body() dto: UpdateBoardItemDto) {
    return this.familyHubService.updateBoardItem(req.user.clientProfileId, itemId, dto);
  }

  @Post('items/:id/book')
  @ApiOperation({ summary: 'Book service with full escrow payment (Client)' })
  bookItem(@Param('id') itemId: string, @Req() req: any, @Body() dto: BookBoardItemDto) {
    return this.familyHubService.bookBoardItem(req.user.clientProfileId, itemId, dto);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a family member to workspace (Client)' })
  inviteMember(@Req() req: any, @Body() dto: InviteMemberDto) {
    return this.familyHubService.inviteMember(req.user.clientProfileId, dto);
  }
}
