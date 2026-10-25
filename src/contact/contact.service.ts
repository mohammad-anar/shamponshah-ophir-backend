import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInquiryDto, VendorApplicationDto, NewsletterSubscribeDto } from './dto/contact.dto';
import { NotificationType, Role } from '@prisma/client';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createInquiry(dto: CreateInquiryDto) {
    const ticketId = `OPH-TKT-${Date.now().toString(36).toUpperCase()}`;

    this.logger.log(`Received contact inquiry: ${ticketId} from ${dto.name} (${dto.email}) - [${dto.topic}]`);

    // Notify all admin users about the new inquiry
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN },
        select: { id: true },
      });

      for (const admin of admins) {
        await this.prisma.notification.create({
          data: {
            userId: admin.id,
            type: NotificationType.GENERAL,
            title: `New Concierge Request (${dto.topic.toUpperCase()})`,
            body: `Inquiry #${ticketId} from ${dto.name} (${dto.email}): "${dto.message.slice(0, 120)}${dto.message.length > 120 ? '...' : ''}"`,
            link: `/admin/support`,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Could not dispatch admin notification for inquiry ${ticketId}: ${err}`);
    }

    return {
      success: true,
      ticketNumber: ticketId,
      name: dto.name,
      email: dto.email,
      topic: dto.topic,
      message: dto.message,
      estimatedResponse: 'Under 2 hours (VIP Concierge Desk)',
      createdAt: new Date().toISOString(),
    };
  }

  async applyVendor(dto: VendorApplicationDto) {
    const applicationId = `OPH-GUILD-${Date.now().toString(36).toUpperCase()}`;

    this.logger.log(`Received Artisan Guild application: ${applicationId} for "${dto.businessName}" (${dto.category})`);

    // Notify admins about new application
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN },
        select: { id: true },
      });

      for (const admin of admins) {
        await this.prisma.notification.create({
          data: {
            userId: admin.id,
            type: NotificationType.GENERAL,
            title: `New Artisan Guild Application: ${dto.businessName}`,
            body: `Application #${applicationId} received for ${dto.category} in ${dto.city}. Review credentials and portfolio: ${dto.portfolioUrl || 'None specified'}.`,
            link: `/admin/vendor-approvals`,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Could not dispatch admin notification for vendor application ${applicationId}: ${err}`);
    }

    return {
      success: true,
      applicationId,
      businessName: dto.businessName,
      category: dto.category,
      city: dto.city,
      status: 'UNDER_REVIEW',
      reviewTimeline: '24-48 business hours',
      createdAt: new Date().toISOString(),
    };
  }

  async subscribeNewsletter(dto: NewsletterSubscribeDto) {
    this.logger.log(`Newsletter subscription: ${dto.email}`);
    return {
      success: true,
      email: dto.email,
      message: 'Subscribed to Ophir Reserve private updates and curated artisan features.',
    };
  }

  getFaqs() {
    return [
      {
        category: 'Escrow Vault & Payouts',
        questions: [
          {
            q: 'How does the Ophir Milestone Escrow Vault work?',
            a: 'When you confirm a booking, your payment is placed into a segregated, FDIC-insured escrow account. The artisan is notified that funds are guaranteed, but money is only released to the artisan when each pre-agreed milestone is inspected and explicitly signed off by you.',
          },
          {
            q: 'What are the platform fees?',
            a: 'Ophir charges a flat, transparent 5% platform escrow fee to hosts, which covers escrow custodial banking, dispute mediation insurance, and 24/7 celebration concierge. Artisans pay 0% commission and keep 100% of their agreed rate.',
          },
          {
            q: 'When do vendors receive their payouts?',
            a: 'Upon client sign-off in the dashboard, payout releases immediately via Stripe Direct Bank Transfer, typically arriving within 1–2 business days.',
          },
        ],
      },
      {
        category: 'Collaborative Family Planning',
        questions: [
          {
            q: 'How do family members contribute to the celebration escrow?',
            a: 'Hosts can invite co-hosts, parents, or family members to their Family Planning Hub. Collaborators can vote on shortlisted artisan services and pledge or contribute funds directly into the celebration escrow pool.',
          },
          {
            q: 'Can family members approve milestone disbursements without the primary host?',
            a: 'Only collaborators designated as Host or Co-Planner with disbursement authorization can approve milestone fund releases.',
          },
        ],
      },
      {
        category: 'Vendor Vetting & Mediation',
        questions: [
          {
            q: 'How are Ophir artisans verified?',
            a: 'Every artisan undergoes a 4-point verification check: government identity audit, active business registration verification, past client portfolio review, and contingency backup crew confirmation.',
          },
          {
            q: 'What happens if a vendor cancels or fails to deliver?',
            a: 'Because your funds remain safely in the Escrow Vault, you are protected by the Ophir Reserve 100% Money-Back Guarantee. In the rare event of vendor non-appearance, funds are refunded immediately and our concierge provides emergency backup artisan matching.',
          },
        ],
      },
    ];
  }
}
