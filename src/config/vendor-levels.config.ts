import { VendorTier } from '@prisma/client';

export interface VendorLevelTheme {
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  gradient: string;
  glowColor: string;
  ringColor: string;
  heroOverlay: string;
}

export interface VendorLevelConfig {
  tier: VendorTier;
  levelNumber: number;
  title: string;
  badgeLabel: string;
  tagline: string;
  // Threshold requirements (Config-driven, not hardcoded)
  minCompletedOrders: number;
  minEarnings: number; // completed work delivery amount
  minDeliveryRate: number; // percentage (0 - 100)
  maxCancellationRatio: number; // percentage (0 - 100)
  minRating: number; // 0 - 5.0
  minResponseRate: number; // percentage (0 - 100)
  // Level-specific profile theme accents
  theme: VendorLevelTheme;
  perks: string[];
}

/**
 * Config-driven Vendor Level Thresholds and Theme Settings
 * Thresholds can be adjusted dynamically here without touching business logic.
 */
export const VENDOR_LEVELS_CONFIG: Record<VendorTier, VendorLevelConfig> = {
  [VendorTier.SPROUT]: {
    tier: VendorTier.SPROUT,
    levelNumber: 1,
    title: 'Sprout Artisan',
    badgeLabel: 'Level 1 Artisan',
    tagline: 'Fresh talent bringing creative energy to the marketplace',
    minCompletedOrders: 0,
    minEarnings: 0,
    minDeliveryRate: 0,
    maxCancellationRatio: 100,
    minRating: 0,
    minResponseRate: 0,
    theme: {
      accentColor: '#10B981', // Emerald
      accentBg: '#064E3B',
      accentBorder: '#059669',
      badgeBg: 'rgba(6, 78, 59, 0.7)',
      badgeText: '#34D399',
      badgeBorder: 'rgba(16, 185, 129, 0.4)',
      gradient: 'from-emerald-950/40 via-[#0B0C0E]/70 to-[#0B0C0E]',
      glowColor: 'rgba(16, 185, 129, 0.25)',
      ringColor: 'rgba(16, 185, 129, 0.5)',
      heroOverlay: 'linear-gradient(to top, #0B0C0E 0%, rgba(6, 78, 59, 0.2) 60%, transparent 100%)',
    },
    perks: [
      'Standard marketplace visibility',
      'Full escrow payment protection',
      'Up to 5 active gigs / service listings',
      'Cold-start exposure boost in search rankings',
    ],
  },

  [VendorTier.RISING]: {
    tier: VendorTier.RISING,
    levelNumber: 2,
    title: 'Rising Talent',
    badgeLabel: 'Level 2 Rising',
    tagline: 'Proven reliability with satisfied clients and quality delivery',
    minCompletedOrders: 5,
    minEarnings: 1500,
    minDeliveryRate: 85,
    maxCancellationRatio: 12,
    minRating: 4.5,
    minResponseRate: 75,
    theme: {
      accentColor: '#06B6D4', // Cyan / Sky Blue
      accentBg: '#083344',
      accentBorder: '#0891B2',
      badgeBg: 'rgba(8, 51, 68, 0.75)',
      badgeText: '#38BDF8',
      badgeBorder: 'rgba(6, 182, 212, 0.45)',
      gradient: 'from-cyan-950/40 via-[#0B0C0E]/70 to-[#0B0C0E]',
      glowColor: 'rgba(6, 182, 212, 0.25)',
      ringColor: 'rgba(6, 182, 212, 0.5)',
      heroOverlay: 'linear-gradient(to top, #0B0C0E 0%, rgba(8, 51, 68, 0.25) 60%, transparent 100%)',
    },
    perks: [
      '1.3x Search ranking boost factor',
      'Priority client inquiry routing',
      'Up to 10 active gigs / service listings',
      'Access to higher-budget private job offers',
    ],
  },

  [VendorTier.PRO]: {
    tier: VendorTier.PRO,
    levelNumber: 3,
    title: 'Pro Verified',
    badgeLabel: 'Level 3 Pro Verified',
    tagline: 'High-performing specialist with verified track record of excellence',
    minCompletedOrders: 20,
    minEarnings: 6000,
    minDeliveryRate: 90,
    maxCancellationRatio: 6,
    minRating: 4.7,
    minResponseRate: 85,
    theme: {
      accentColor: '#818CF8', // Royal Indigo / Lavender
      accentBg: '#312E81',
      accentBorder: '#6366F1',
      badgeBg: 'rgba(49, 46, 129, 0.75)',
      badgeText: '#A5B4FC',
      badgeBorder: 'rgba(99, 102, 241, 0.45)',
      gradient: 'from-indigo-950/40 via-[#0B0C0E]/70 to-[#0B0C0E]',
      glowColor: 'rgba(99, 102, 241, 0.3)',
      ringColor: 'rgba(99, 102, 241, 0.55)',
      heroOverlay: 'linear-gradient(to top, #0B0C0E 0%, rgba(49, 46, 129, 0.3) 60%, transparent 100%)',
    },
    perks: [
      '1.6x Search ranking multiplier',
      'Verified Pro badge on all search cards',
      'Unlimited gig listings & milestone templates',
      'Dedicated seller dispute protection assistance',
      'Fast-track 3-day funds clearing window',
    ],
  },

  [VendorTier.ELITE]: {
    tier: VendorTier.ELITE,
    levelNumber: 4,
    title: 'Elite Guild Master',
    badgeLabel: 'Level 4 Elite Guild',
    tagline: 'Top 1% elite artisan with legendary client satisfaction and master craft',
    minCompletedOrders: 50,
    minEarnings: 20000,
    minDeliveryRate: 95,
    maxCancellationRatio: 3,
    minRating: 4.85,
    minResponseRate: 90,
    theme: {
      accentColor: '#DFB76C', // Luxury Platinum Gold
      accentBg: '#78350F',
      accentBorder: '#DFB76C',
      badgeBg: 'rgba(26, 29, 36, 0.85)',
      badgeText: '#DFB76C',
      badgeBorder: 'rgba(223, 183, 108, 0.5)',
      gradient: 'from-[#DFB76C]/15 via-[#0B0C0E]/70 to-[#0B0C0E]',
      glowColor: 'rgba(223, 183, 108, 0.35)',
      ringColor: 'rgba(223, 183, 108, 0.6)',
      heroOverlay: 'linear-gradient(to top, #0B0C0E 0%, rgba(120, 53, 15, 0.25) 60%, transparent 100%)',
    },
    perks: [
      '2.0x Peak marketplace prominence',
      'Exclusive Elite Guild Crown badge & luxury gold profile theme',
      'Direct inclusion in VIP concierge recommendations',
      'Zero-wait instant milestone payouts upon delivery approval',
    ],
  },
};

/**
 * Determine a vendor's eligible tier based on their performance metrics
 * and config thresholds.
 */
export function evaluateVendorTier(stats: {
  completedOrders: number;
  totalEarnings: number;
  deliveryRate: number;
  avgRating: number;
  cancelRatio: number;
}): VendorTier {
  const eliteCfg = VENDOR_LEVELS_CONFIG[VendorTier.ELITE];
  const proCfg = VENDOR_LEVELS_CONFIG[VendorTier.PRO];
  const risingCfg = VENDOR_LEVELS_CONFIG[VendorTier.RISING];

  // Elite (Level 4): Highest thresholds
  if (
    (stats.completedOrders >= eliteCfg.minCompletedOrders || stats.totalEarnings >= eliteCfg.minEarnings) &&
    stats.deliveryRate >= eliteCfg.minDeliveryRate &&
    stats.avgRating >= eliteCfg.minRating &&
    stats.cancelRatio <= eliteCfg.maxCancellationRatio
  ) {
    return VendorTier.ELITE;
  }

  // Pro (Level 3)
  if (
    (stats.completedOrders >= proCfg.minCompletedOrders || stats.totalEarnings >= proCfg.minEarnings) &&
    stats.deliveryRate >= proCfg.minDeliveryRate &&
    stats.avgRating >= proCfg.minRating &&
    stats.cancelRatio <= proCfg.maxCancellationRatio
  ) {
    return VendorTier.PRO;
  }

  // Rising (Level 2)
  if (
    (stats.completedOrders >= risingCfg.minCompletedOrders || stats.totalEarnings >= risingCfg.minEarnings) &&
    stats.deliveryRate >= risingCfg.minDeliveryRate &&
    stats.avgRating >= risingCfg.minRating &&
    stats.cancelRatio <= risingCfg.maxCancellationRatio
  ) {
    return VendorTier.RISING;
  }

  // Default: Sprout (Level 1)
  return VendorTier.SPROUT;
}
