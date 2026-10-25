import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') || 'default-secret-change-me',
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        clientProfile: { select: { id: true } },
        vendorProfile: { select: { id: true } },
        adminProfile: { select: { id: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      clientProfileId: user.clientProfile?.id,
      vendorProfileId: user.vendorProfile?.id,
      adminProfileId: user.adminProfile?.id,
    };
  }
}
