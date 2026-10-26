import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { Role, VendorStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const emailToken = this.generateToken();
    console.log(`[AUTH] Registered user ${dto.email} with verification code: ${emailToken}`);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        emailToken,
        ...(dto.role === Role.CLIENT && {
          clientProfile: {
            create: { displayName: dto.displayName || dto.email.split('@')[0] },
          },
        }),
        ...(dto.role === Role.VENDOR && {
          vendorProfile: {
            create: {
              businessName: dto.businessName || 'My Business',
              slug: this.toSlug(dto.businessName || dto.email),
            },
          },
        }),
      },
      include: { clientProfile: true, vendorProfile: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user: this.sanitize(user), ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { clientProfile: true, vendorProfile: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user: this.sanitize(user), ...tokens };
  }

  async refresh(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.refreshTokenHash) throw new UnauthorizedException();

      const valid = await bcrypt.compare(token, user.refreshTokenHash);
      if (!valid) throw new UnauthorizedException('Refresh token invalid');

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      await this.saveRefreshToken(user.id, tokens.refreshToken);
      return tokens;
    } catch {
      throw new UnauthorizedException('Refresh token expired or invalid');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return { message: 'If that email exists, a reset link was sent' };

    const token = this.generateToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailToken: token },
    });

    // TODO: Send reset email via EmailService
    return { message: 'Password reset link sent', token }; // remove token in prod
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({ where: { emailToken: dto.token } });
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, emailToken: null },
    });

    return { message: 'Password updated successfully' };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { emailToken: token },
      include: { vendorProfile: true },
    });
    if (!user) throw new BadRequestException('Invalid or expired verification token');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, emailToken: null },
    });

    // Vendor verification directly activates the account (no manual admin approval)
    if (user.role === Role.VENDOR && user.vendorProfile) {
      await this.prisma.vendorProfile.update({
        where: { id: user.vendorProfile.id },
        data: { status: VendorStatus.APPROVED },
      });
    }

    return { message: 'Email verified successfully', role: user.role };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User with this email not found');
    if (user.isEmailVerified) {
      return { message: 'Email is already verified', alreadyVerified: true };
    }

    const emailToken = this.generateToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailToken },
    });

    console.log(`[AUTH] Resent verification code to ${email}: ${emailToken}`);
    return { message: 'Verification email sent successfully', token: emailToken };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true, vendorProfile: true, adminProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  // ── Private Helpers ────────────────────────────────────────

  private async generateTokens(userId: string, email: string, role: Role) {
    const payload = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const hash = await bcrypt.hash(token, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

  private generateToken() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private toSlug(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
  }

  private sanitize(user: any) {
    const { passwordHash, refreshTokenHash, emailToken, ...safe } = user;
    return safe;
  }
}
