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

  private readonly signupRateLimits = new Map<string, { count: number; expiresAt: number }>();
  private readonly resendRateLimits = new Map<string, { count: number; expiresAt: number }>();

  async register(dto: RegisterDto, ip: string = '127.0.0.1') {
    // 1. Basic bot honeypot protection
    if (dto.website && dto.website.trim().length > 0) {
      throw new BadRequestException('Automated registration rejected.');
    }

    // 2. IP Rate Limiting (max 5 signups per 15 mins)
    this.checkRateLimit(this.signupRateLimits, ip, 5, 15 * 60 * 1000, 'Too many signup attempts. Please try again in 15 minutes.');

    // 3. Strict Role Whitelist (CLIENT or VENDOR only - ADMIN never allowed)
    const normalizedRole = typeof dto.role === 'string' ? (dto.role as string).toUpperCase() : dto.role;
    if (normalizedRole !== Role.CLIENT && normalizedRole !== Role.VENDOR) {
      throw new BadRequestException('Invalid registration role. Only CLIENT and VENDOR are permitted.');
    }

    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    if (exists) throw new ConflictException('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const emailToken = this.generateToken();
    console.log(`[AUTH] Registered ${normalizedRole} (${dto.email}) with verification code: ${emailToken}`);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        role: normalizedRole as Role,
        emailToken,
        isEmailVerified: false,
        ...(normalizedRole === Role.CLIENT && {
          clientProfile: {
            create: {
              displayName: dto.fullName || dto.displayName || dto.email.split('@')[0],
              phone: dto.phone,
            },
          },
        }),
        ...(normalizedRole === Role.VENDOR && {
          vendorProfile: {
            create: {
              businessName: dto.businessName || dto.fullName || 'Vendor Studio',
              slug: this.toSlug(dto.businessName || dto.fullName || dto.email),
              phone: dto.phone,
              tier: 'SPROUT',
              status: VendorStatus.PENDING_APPROVAL,
              wallet: {
                create: {
                  pendingAmount: 0,
                  pendingForReleaseAmount: 0,
                  availableAmount: 0,
                  totalEarned: 0,
                  totalWithdrawn: 0,
                },
              },
            },
          },
        }),
      },
      include: { clientProfile: true, vendorProfile: true },
    });

    return {
      message: 'Registration successful. Please verify your email to activate your account.',
      user: this.sanitize(user),
      email: user.email,
      role: user.role,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { clientProfile: true, vendorProfile: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // Unverified users must verify email to activate account
    if (!user.isEmailVerified) {
      throw new UnauthorizedException({
        message: 'Your email address is not verified. Please verify your email to activate your account.',
        isEmailVerified: false,
        email: user.email,
        role: user.role,
      });
    }

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
      where: { emailToken: token.trim() },
      include: { vendorProfile: true, clientProfile: true },
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

    const updatedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { clientProfile: true, vendorProfile: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      message: 'Email verified successfully. Account is now active.',
      role: user.role,
      user: this.sanitize(updatedUser),
      ...tokens,
    };
  }

  async resendVerification(email: string, ip: string = '127.0.0.1') {
    const normalizedEmail = email.toLowerCase().trim();
    this.checkRateLimit(
      this.resendRateLimits,
      `${ip}_${normalizedEmail}`,
      3,
      10 * 60 * 1000,
      'Too many verification email requests. Please wait 10 minutes before trying again.',
    );

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) throw new NotFoundException('User with this email not found');
    if (user.isEmailVerified) {
      return { message: 'Email is already verified', alreadyVerified: true };
    }

    const emailToken = this.generateToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailToken },
    });

    console.log(`[AUTH] Resent verification code to ${normalizedEmail}: ${emailToken}`);
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

  private checkRateLimit(
    map: Map<string, { count: number; expiresAt: number }>,
    key: string,
    maxCount: number,
    windowMs: number,
    errorMessage: string,
  ) {
    const now = Date.now();
    const entry = map.get(key);
    if (!entry || now > entry.expiresAt) {
      map.set(key, { count: 1, expiresAt: now + windowMs });
      return;
    }
    if (entry.count >= maxCount) {
      throw new BadRequestException(errorMessage);
    }
    entry.count += 1;
  }
}
