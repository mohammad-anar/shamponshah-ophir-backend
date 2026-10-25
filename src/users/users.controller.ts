import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateClientProfileDto, ChangePasswordDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users & Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile/client')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Get authenticated client profile (Client)' })
  getClientProfile(@Req() req: any) {
    return this.usersService.getClientProfile(req.user.clientProfileId);
  }

  @Patch('profile/client')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Update client profile details (Client)' })
  updateClientProfile(@Req() req: any, @Body() dto: UpdateClientProfileDto) {
    return this.usersService.updateClientProfile(req.user.clientProfileId, dto);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change current user password' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(req.user.sub, dto);
  }

  @Get('overview/client')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Get client dashboard summary stats (Client)' })
  getClientOverview(@Req() req: any) {
    return this.usersService.getClientOverview(req.user.clientProfileId);
  }

  @Get('overview/vendor')
  @UseGuards(RolesGuard)
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get vendor dashboard summary stats (Vendor)' })
  getVendorOverview(@Req() req: any) {
    return this.usersService.getVendorOverview(req.user.vendorProfileId);
  }
}
