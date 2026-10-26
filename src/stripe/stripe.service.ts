import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY') as string, {
      apiVersion: '2026-09-30.endive' as any,
    });
  }

  // ── Payment Intent (Escrow deposit) ───────────────────────

  async createPaymentIntent(params: {
    amount: number;
    currency?: string;
    orderId: string;
    milestoneId: string;
    clientId: string;
    vendorId: string;
    customerId?: string;
    paymentMethodId?: string;
    idempotencyKey: string;
  }) {
    const amountInCents = Math.round(params.amount * 100);

    return this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency: params.currency || 'usd',
      transfer_group: params.orderId,
      metadata: {
        orderId: params.orderId,
        milestoneId: params.milestoneId,
        clientId: params.clientId,
        vendorId: params.vendorId,
      },
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      confirm: !!params.paymentMethodId,
      automatic_payment_methods: params.paymentMethodId ? undefined : { enabled: true },
    }, { idempotencyKey: params.idempotencyKey });
  }

  async createOrderPaymentIntent(params: {
    amount: number;
    currency?: string;
    orderId: string;
    orderNumber?: string;
    clientId: string;
    vendorId: string;
    platformFee: number;
    vendorNet: number;
    customerId?: string;
    idempotencyKey: string;
  }) {
    const amountInCents = Math.round(params.amount * 100);

    return this.stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: params.currency || 'usd',
        transfer_group: params.orderId,
        metadata: {
          orderId: params.orderId,
          orderNumber: params.orderNumber || '',
          clientId: params.clientId,
          vendorProfileId: params.vendorId,
          platformFee: String(params.platformFee),
          vendorNet: String(params.vendorNet),
          type: 'ORDER_ESCROW',
        },
        customer: params.customerId,
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  async createOffSessionOrderPaymentIntent(params: {
    amount: number;
    currency?: string;
    customerId: string;
    paymentMethodId: string;
    transferGroup: string;
    metadata: Record<string, string>;
    idempotencyKey?: string;
  }) {
    const amountInCents = Math.round(params.amount * 100);

    return this.stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: params.currency || 'usd',
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        off_session: true,
        confirm: true,
        transfer_group: params.transferGroup,
        metadata: params.metadata,
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
    );
  }

  async retrievePaymentIntent(paymentIntentId: string) {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async confirmPaymentIntent(paymentIntentId: string, paymentMethodId: string) {
    return this.stripe.paymentIntents.confirm(paymentIntentId, { payment_method: paymentMethodId });
  }

  async cancelPaymentIntent(paymentIntentId: string) {
    return this.stripe.paymentIntents.cancel(paymentIntentId);
  }

  // ── Milestone Transfer (to vendor Stripe account) ─────────

  async transferMilestone(params: {
    amount: number;
    vendorStripeAccountId: string;
    orderId: string;
    milestoneId: string;
    paymentIntentId: string;
    idempotencyKey?: string;
  }) {
    const amountInCents = Math.round(params.amount * 100);

    const paymentIntent = await this.stripe.paymentIntents.retrieve(params.paymentIntentId);
    const chargeId = paymentIntent.latest_charge as string;

    return this.stripe.transfers.create({
      amount: amountInCents,
      currency: 'usd',
      destination: params.vendorStripeAccountId,
      transfer_group: params.orderId,
      source_transaction: chargeId,
      metadata: { orderId: params.orderId, milestoneId: params.milestoneId },
    }, { idempotencyKey: params.idempotencyKey || `milestone-release-${params.milestoneId}` });
  }

  // ── Stripe Connect (Vendor Express onboarding) ────────────

  async createConnectAccount(vendorId: string, email: string) {
    return this.stripe.accounts.create({
      type: 'express',
      country: 'US',
      email,
      capabilities: { transfers: { requested: true } },
      metadata: { vendorId },
    });
  }

  async createOnboardingLink(stripeAccountId: string, baseUrl: string) {
    return this.stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseUrl}/vendor/payout-settings?refresh=true`,
      return_url: `${baseUrl}/vendor/payout-settings?connected=true`,
      type: 'account_onboarding',
    });
  }

  async createExpressDashboardLink(stripeAccountId: string) {
    return this.stripe.accounts.createLoginLink(stripeAccountId);
  }

  async getAccountStatus(stripeAccountId: string) {
    const account = await this.stripe.accounts.retrieve(stripeAccountId);
    return {
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      transfersEnabled: account.capabilities?.transfers === 'active',
      detailsSubmitted: account.details_submitted,
      requirements: account.requirements,
    };
  }

  async getConnectedBalance(stripeAccountId: string, currency = 'usd') {
    const balance = await this.stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });
    const code = currency.toLowerCase();
    return {
      available: (balance.available || []).filter((item) => item.currency === code).reduce((sum, item) => sum + item.amount, 0) / 100,
      pending: (balance.pending || []).filter((item) => item.currency === code).reduce((sum, item) => sum + item.amount, 0) / 100,
    };
  }

  // ── Vendor Payouts ─────────────────────────────────────────

  async createPayout(params: {
    amount: number;
    stripeAccountId: string;
    method?: 'standard' | 'instant';
  }) {
    const amountInCents = Math.round(params.amount * 100);

    return this.stripe.payouts.create(
      {
        amount: amountInCents,
        currency: 'usd',
        method: params.method || 'standard',
      },
      { stripeAccount: params.stripeAccountId },
    );
  }

  // ── Refunds (Dispute resolution) ─────────────────────────

  async createRefund(params: {
    paymentIntentId: string;
    amount?: number;
    reason?: string;
    idempotencyKey?: string;
  }) {
    return this.stripe.refunds.create({
      payment_intent: params.paymentIntentId,
      amount: params.amount ? Math.round(params.amount * 100) : undefined,
      reason: (params.reason as any) || 'requested_by_customer',
    }, params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined);
  }

  async reverseTransfer(transferId: string, amount?: number, idempotencyKey?: string) {
    return this.stripe.transfers.createReversal(
      transferId,
      { amount: amount ? Math.round(amount * 100) : undefined },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  }

  // ── Bid Credit Payment ─────────────────────────────────────

  async chargeBidCredits(params: {
    amount: number;
    paymentMethodId: string;
    customerId?: string;
    description: string;
  }) {
    return this.stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: 'usd',
      payment_method: params.paymentMethodId,
      customer: params.customerId,
      confirm: true,
      description: params.description,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
  }

  // ── Webhook Verification ──────────────────────────────────

  constructWebhookEvent(payload: Buffer, sig: string, secret: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, sig, secret);
    } catch (err) {
      throw new BadRequestException(`Webhook error: ${(err as Error).message}`);
    }
  }

  // ── Payment Methods ────────────────────────────────────────

  async attachPaymentMethod(paymentMethodId: string, customerId: string) {
    return this.stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  }

  async listPaymentMethods(customerId: string) {
    return this.stripe.paymentMethods.list({ customer: customerId, type: 'card' });
  }

  async detachPaymentMethod(paymentMethodId: string) {
    return this.stripe.paymentMethods.detach(paymentMethodId);
  }

  async createCustomer(email: string, name?: string) {
    return this.stripe.customers.create({ email, name });
  }

  async createSetupIntent(customerId?: string) {
    return this.stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true },
    });
  }

  async getPaymentMethodDetails(paymentMethodId: string) {
    return this.stripe.paymentMethods.retrieve(paymentMethodId);
  }
}
