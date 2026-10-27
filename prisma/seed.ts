import { 
  PrismaClient, 
  Role, 
  VendorTier, 
  VendorStatus, 
  NotificationType 
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import { VENDOR_LEVELS_CONFIG } from '../src/config/vendor-levels.config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL is required to run the seed script.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log('================================================================');
  console.log('🌱 RUNNING MASTER PRODUCTION-SAFE & DEMO SEED SCRIPT');
  console.log('================================================================');

  const defaultPassword = await bcrypt.hash('Ophir1234!', 10);

  // 1. ADMIN ACCOUNTS (admin@ophir.com and admin@jubilee.com)
  console.log('🔐 Setting up Admin Accounts...');
  const adminUsers = [
    { email: 'admin@ophir.com', name: 'Ophir Operations Director' },
    { email: 'admin@jubilee.com', name: 'System Administrator' },
  ];

  for (const adm of adminUsers) {
    const user = await prisma.user.upsert({
      where: { email: adm.email },
      update: {
        role: Role.ADMIN,
        isEmailVerified: true,
        passwordHash: defaultPassword,
      },
      create: {
        email: adm.email,
        passwordHash: defaultPassword,
        role: Role.ADMIN,
        isEmailVerified: true,
      },
    });

    await prisma.adminProfile.upsert({
      where: { userId: user.id },
      update: { name: adm.name },
      create: { userId: user.id, name: adm.name },
    });
  }
  console.log('✅ Admin accounts verified and configured (admin@ophir.com & admin@jubilee.com / Ophir1234!).');

  // 2. VENDOR USERS & PROFILES (6 Elite Vendors for Demo & Production)
  console.log('🏪 Setting up 6 Demo & Elite Vendors...');
  const vendorsData = [
    {
      email: 'luminary@ophir.com',
      businessName: 'Luminary Studios',
      slug: 'luminary-studios',
      tagline: 'Timeless luxury wedding & editorial cinematography',
      bio: 'Vogue-published event and wedding photographer based in Chicago. Specializing in emotion-driven, documentary-style photography with an editorial eye.',
      tier: VendorTier.ELITE,
      city: 'Chicago',
      state: 'IL',
      rating: 4.98,
      reviewCount: 48,
      ordersCompleted: 54,
      bidCredits: 85,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=80',
    },
    {
      email: 'bloom@ophir.com',
      businessName: 'Bloom & Petal Studio',
      slug: 'bloom-petal-studio',
      tagline: 'Organic pastel floral arches & luxury event styling',
      bio: 'Master florists and experiential stylists crafting breathtaking botanical backdrops, suspension floral clouds, and heirloom table scapes.',
      tier: VendorTier.PRO,
      city: 'Chicago',
      state: 'IL',
      rating: 4.92,
      reviewCount: 39,
      ordersCompleted: 44,
      bidCredits: 40,
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1600&q=80',
    },
    {
      email: 'epicurean@ophir.com',
      businessName: 'Epicurean Bites Catering',
      slug: 'epicurean-bites',
      tagline: 'Farm-to-table plated galas & artisanal celebration dining',
      bio: 'Michelin-trained culinary team creating tailored 3-course plated dining and elevated cocktail hour grazing for luxury weddings and corporate galas.',
      tier: VendorTier.ELITE,
      city: 'Naperville',
      state: 'IL',
      rating: 4.97,
      reviewCount: 31,
      ordersCompleted: 35,
      bidCredits: 50,
      avatarUrl: 'https://images.unsplash.com/photo-1583394293214-28ded15ee548?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1600&q=80',
    },
    {
      email: 'velvetpour@ophir.com',
      businessName: 'Velvet Pour Mixology',
      slug: 'velvet-pour-mixology',
      tagline: 'Bespoke craft cocktail bars & flair mixologists',
      bio: 'Handcrafted syrups, fresh botanical garnishes, and custom monogrammed ice. We transform celebrations with unforgettable beverage hospitality.',
      tier: VendorTier.RISING,
      city: 'Chicago',
      state: 'IL',
      rating: 4.89,
      reviewCount: 22,
      ordersCompleted: 26,
      bidCredits: 30,
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1600&q=80',
    },
    {
      email: 'sweetdelights@ophir.com',
      businessName: 'Sweet Delights Artisan Cakes',
      slug: 'sweet-delights-cakes',
      tagline: 'Sculpted fondant milestone cakes & luxury dessert bars',
      bio: 'Artisan cake designer specializing in sugar florals, architectural multi-tier wedding cakes, and French macaron installations that taste as divine as they look.',
      tier: VendorTier.PRO,
      city: 'Evanston',
      state: 'IL',
      rating: 4.94,
      reviewCount: 41,
      ordersCompleted: 48,
      bidCredits: 45,
      avatarUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?auto=format&fit=crop&w=1600&q=80',
    },
    {
      email: 'windycity@ophir.com',
      businessName: 'Windy City Sound LLC',
      slug: 'windy-city-sound',
      tagline: 'High-energy DJ & live interactive MC for milestone events',
      bio: 'Over 12 years creating packed dancefloors across the Midwest. Premium sound design, wireless microphones, smart ambient uplighting, and seamless crowd engagement.',
      tier: VendorTier.PRO,
      city: 'Chicago',
      state: 'IL',
      rating: 4.95,
      reviewCount: 62,
      ordersCompleted: 70,
      bidCredits: 60,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1600&q=80',
    },
  ];

  for (const v of vendorsData) {
    const user = await prisma.user.upsert({
      where: { email: v.email },
      update: {
        role: Role.VENDOR,
        isEmailVerified: true,
        passwordHash: defaultPassword,
      },
      create: {
        email: v.email,
        passwordHash: defaultPassword,
        role: Role.VENDOR,
        isEmailVerified: true,
      },
    });

    const vendorProfile = await prisma.vendorProfile.upsert({
      where: { userId: user.id },
      update: {
        businessName: v.businessName,
        slug: v.slug,
        tagline: v.tagline,
        bio: v.bio,
        tier: v.tier,
        status: VendorStatus.APPROVED,
        city: v.city,
        state: v.state,
        serviceRadius: '100 miles',
        responseSpeed: 'Within 1 hour',
        rating: v.rating,
        reviewCount: v.reviewCount,
        ordersCompleted: v.ordersCompleted,
        bidCredits: v.bidCredits,
        identityVerified: true,
        payoutsEnabled: true,
        avatarUrl: v.avatarUrl,
        heroImageUrl: v.heroImageUrl,
      },
      create: {
        userId: user.id,
        businessName: v.businessName,
        slug: v.slug,
        tagline: v.tagline,
        bio: v.bio,
        tier: v.tier,
        status: VendorStatus.APPROVED,
        city: v.city,
        state: v.state,
        serviceRadius: '100 miles',
        responseSpeed: 'Within 1 hour',
        rating: v.rating,
        reviewCount: v.reviewCount,
        ordersCompleted: v.ordersCompleted,
        bidCredits: v.bidCredits,
        identityVerified: true,
        payoutsEnabled: true,
        avatarUrl: v.avatarUrl,
        heroImageUrl: v.heroImageUrl,
        stripeAccountId: `acct_${v.slug.replace(/-/g, '_')}`,
        stripeAccountStatus: 'active',
      },
    });

    // Create VendorWallet if missing
    await prisma.vendorWallet.upsert({
      where: { vendorProfileId: vendorProfile.id },
      update: {},
      create: {
        vendorProfileId: vendorProfile.id,
        pendingAmount: 0,
        pendingForReleaseAmount: 0,
        availableAmount: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
      },
    });
  }
  console.log(`✅ ${vendorsData.length} Vendors created with profiles & wallets (luminary@ophir.com / Ophir1234!).`);

  // 3. CLIENT USERS & PROFILES
  console.log('👤 Setting up Demo Clients...');
  const clientsData = [
    {
      email: 'sarah@ophir.com',
      displayName: 'Sarah Jenkins',
      phone: '+1 (312) 555-0192',
      city: 'Chicago',
      state: 'IL',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    },
    {
      email: 'emily.carter@gmail.com',
      displayName: 'Emily Carter',
      phone: '+1 (312) 555-8321',
      city: 'Lincoln Park, Chicago',
      state: 'IL',
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    },
    {
      email: 'marcus.sterling@apex.com',
      displayName: 'Marcus Sterling',
      phone: '+1 (630) 555-9012',
      city: 'Naperville',
      state: 'IL',
      avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
    },
    {
      email: 'david.vance@gmail.com',
      displayName: 'David Vance',
      phone: '+1 (847) 555-4491',
      city: 'Evanston',
      state: 'IL',
      avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80',
    },
    {
      email: 'elena.rostova@gmail.com',
      displayName: 'Elena Rostova',
      phone: '+1 (773) 555-3129',
      city: 'Oak Park',
      state: 'IL',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    },
    {
      email: 'jessica.davis@gmail.com',
      displayName: 'Jessica Davis',
      phone: '+1 (312) 555-6677',
      city: 'Chicago',
      state: 'IL',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    },
  ];

  for (const c of clientsData) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {
        role: Role.CLIENT,
        isEmailVerified: true,
        passwordHash: defaultPassword,
      },
      create: {
        email: c.email,
        passwordHash: defaultPassword,
        role: Role.CLIENT,
        isEmailVerified: true,
      },
    });

    const clientProfile = await prisma.clientProfile.upsert({
      where: { userId: user.id },
      update: {
        displayName: c.displayName,
        phone: c.phone,
        city: c.city,
        state: c.state,
        avatarUrl: c.avatarUrl,
      },
      create: {
        userId: user.id,
        displayName: c.displayName,
        phone: c.phone,
        city: c.city,
        state: c.state,
        avatarUrl: c.avatarUrl,
        stripeCustomerId: `cus_${c.displayName.toLowerCase().replace(/\s+/g, '_')}`,
      },
    });

    // Add sample saved payment method for Sarah
    if (c.email === 'sarah@ophir.com') {
      await prisma.paymentMethod.upsert({
        where: { stripePaymentMethodId: 'pm_card_visa_4242' },
        update: {},
        create: {
          clientProfileId: clientProfile.id,
          stripePaymentMethodId: 'pm_card_visa_4242',
          type: 'card',
          brand: 'Visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2028,
          isDefault: true,
        },
      });
    }
  }
  console.log(`✅ ${clientsData.length} Clients created (sarah@ophir.com / Ophir1234!).`);

  // 4. PLATFORM SETTINGS
  console.log('⚙️  Configuring Platform Settings...');
  const settings = [
    { key: 'platform_fee_percent', value: '15' },
    { key: 'payment_clearing_days', value: '7' },
    { key: 'auto_complete_days', value: '3' },
    { key: 'auto_cancel_unpaid_hours', value: '24' },
    {
      key: 'level_thresholds',
      value: JSON.stringify({
        SPROUT: { minOrders: 0, minEarnings: 0, minDeliveryRate: 0, maxCancellationRatio: 100 },
        RISING: { minOrders: 5, minEarnings: 1500, minDeliveryRate: 90, maxCancellationRatio: 10 },
        PRO: { minOrders: 20, minEarnings: 5000, minDeliveryRate: 95, maxCancellationRatio: 5 },
        ELITE: { minOrders: 50, minEarnings: 15000, minDeliveryRate: 98, maxCancellationRatio: 2 },
      }),
    },
  ];

  for (const s of settings) {
    await prisma.platformSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }
  console.log('✅ Platform Settings saved.');

  // 5. LEVEL RULES
  console.log('🏆 Initializing Vendor Level Definitions...');
  const tiers: VendorTier[] = [
    VendorTier.SPROUT,
    VendorTier.RISING,
    VendorTier.PRO,
    VendorTier.ELITE,
  ];

  for (const tier of tiers) {
    const config = VENDOR_LEVELS_CONFIG[tier];
    await prisma.levelRule.upsert({
      where: { tier },
      update: {
        minOrders: config.minCompletedOrders,
        minRating: config.minRating,
        minResponseRate: config.minResponseRate,
        description: `${config.title} - ${config.tagline}`,
      },
      create: {
        tier,
        minOrders: config.minCompletedOrders,
        minRating: config.minRating,
        minResponseRate: config.minResponseRate,
        description: `${config.title} - ${config.tagline}`,
      },
    });
  }
  console.log('✅ Level Rules synchronized.');

  // 6. BID CREDIT PACKAGES
  console.log('💎 Initializing Bid Credit Packages...');
  const creditPacks = [
    { name: 'Starter Pack', credits: 10, price: 19.99, isPopular: false },
    { name: 'Artisan Pro Pack', credits: 25, price: 39.99, isPopular: true },
    { name: 'Agency Growth Pack', credits: 50, price: 69.99, isPopular: false },
    { name: 'Master Enterprise Pack', credits: 100, price: 119.99, isPopular: false },
  ];

  for (const pack of creditPacks) {
    const existing = await prisma.bidCreditPackage.findFirst({ where: { name: pack.name } });
    if (!existing) {
      await prisma.bidCreditPackage.create({ data: pack });
    }
  }
  console.log('✅ Bid Credit Packages seeded.');

  console.log('================================================================');
  console.log('🎉 MASTER SEED COMPLETED: Demo logins ready for Admin, Client, and Vendor!');
  console.log('================================================================');
}

seed()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
