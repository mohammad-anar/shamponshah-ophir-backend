import { PrismaClient, Role, VendorTier } from '@prisma/client';
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
  console.log('🌱 RUNNING IDEMPOTENT PRODUCTION-SAFE SEED SCRIPT');
  console.log('================================================================');

  // 1. Admin Account (Credentials from environment)
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@jubilee.com').trim().toLowerCase();
  const rawAdminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!';
  const passwordHash = await bcrypt.hash(rawAdminPassword, 10);

  console.log(`🔐 Setting up Admin Account: ${adminEmail}...`);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: Role.ADMIN,
      isEmailVerified: true,
      passwordHash,
    },
    create: {
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      isEmailVerified: true,
    },
  });

  await prisma.adminProfile.upsert({
    where: { userId: adminUser.id },
    update: {
      name: 'System Administrator',
    },
    create: {
      userId: adminUser.id,
      name: 'System Administrator',
    },
  });

  console.log('✅ Admin Account verified and configured.');

  // 2. Platform Settings (Commission 15%, 7-day clearing, auto-complete & auto-cancel windows)
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

  console.log('✅ Platform Settings (15% platform fee, 7-day clearing window) saved.');

  // 3. Level Rules (Definitions from VENDOR_LEVELS_CONFIG)
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

  console.log('✅ Level Rules (Sprout, Rising, Pro, Elite) synchronized.');
  console.log('----------------------------------------------------------------');
  console.log('ℹ️  Note: Categories are NOT seeded; create them via Admin Dashboard.');
  console.log('ℹ️  Note: Dummy users, gigs, and orders are NOT generated.');
  console.log('🎉 Idempotent system seed completed successfully!');
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
