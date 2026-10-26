import { VendorTier } from '@prisma/client';

/**
 * Deterministic pseudo-random number generator (Mulberry32)
 * Initialized from any string or numeric seed via 32-bit FNV-1a hash.
 */
export function createSeededRandom(seedInput: string | number): () => number {
  let h = 2166136261;
  const str = String(seedInput || 'default_seed');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  // Mulberry32 generator
  let a = h >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface VendorRankingMetrics {
  id: string;
  deliveryRate?: number; // 0 - 100
  cancelRatio?: number; // 0 - 100
  tier?: VendorTier | string;
  rating?: number; // 0 - 5.0
  responseRate?: number; // 0 - 100
  ordersCompleted?: number;
  createdAt?: Date | string;
}

export interface GigRankingMetrics {
  id: string;
  orderCount?: number;
  clickCount?: number;
  viewCount?: number;
  createdAt?: Date | string;
  vendorProfile?: {
    tier?: VendorTier | string;
    rating?: number;
    onTimeDeliveryPct?: number;
    ordersCompleted?: number;
  };
}

/**
 * Calculate base performance score (0 - 100)
 * Formula: deliveryRate (higher is better) + cancelRatio (lower is better) +
 * vendor level + rating + response time bonus + cold start boost.
 */
export function calculateVendorBaseScore(v: VendorRankingMetrics): number {
  const deliveryRate = Math.min(100, Math.max(0, Number(v.deliveryRate ?? 98)));
  const cancelRatio = Math.min(100, Math.max(0, Number(v.cancelRatio ?? 2)));
  const rating = Math.min(5, Math.max(0, Number(v.rating ?? 4.9)));
  const responseRate = Math.min(100, Math.max(0, Number(v.responseRate ?? 95)));
  const ordersCompleted = Number(v.ordersCompleted ?? 0);

  // 1. Delivery rate (35 pts max)
  const deliveryPts = (deliveryRate / 100) * 35;

  // 2. Cancellation ratio (25 pts max - lower cancel ratio gives higher score)
  const cancelPts = ((100 - cancelRatio) / 100) * 25;

  // 3. Vendor Tier / Level (20 pts max)
  const tierScores: Record<string, number> = {
    SPROUT: 6,
    RISING: 11,
    PRO: 16,
    ELITE: 20,
  };
  const tierKey = String(v.tier || 'PRO').toUpperCase();
  const tierPts = tierScores[tierKey] || 12;

  // 4. Rating (15 pts max)
  const ratingPts = (rating / 5.0) * 15;

  // 5. Response speed / rate (5 pts max)
  const responsePts = (responseRate / 100) * 5;

  let score = deliveryPts + cancelPts + tierPts + ratingPts + responsePts;

  // Requirement 3: Cold-start exposure bonus for new/sprout vendors
  // If the vendor is new (< 3 orders), grant an exploration boost to give them equal exposure
  if (ordersCompleted < 3) {
    score = Math.max(score, 68); // Baseline competitive score
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate base score for a gig / service
 */
export function calculateGigBaseScore(gig: GigRankingMetrics): number {
  const v = gig.vendorProfile || {};
  const vendorScore = calculateVendorBaseScore({
    id: gig.id,
    deliveryRate: v.onTimeDeliveryPct,
    rating: v.rating,
    tier: v.tier,
    ordersCompleted: v.ordersCompleted,
  });

  const gigOrders = Number(gig.orderCount ?? 0);
  const gigViews = Number(gig.viewCount ?? 0);

  // Conversion / popularity bonus
  const popularityPts = Math.min(10, gigOrders * 0.5 + Math.min(gigViews / 50, 5));

  let score = vendorScore * 0.85 + popularityPts;

  // Cold-start exploration boost for new gigs
  if (gigOrders < 3) {
    score = Math.max(score, 66);
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Apply deterministic weighted jitter using session-based seed.
 * Combines score with randomness so top vendors/gigs don't permanently monopolize #1,
 * while ensuring identical ordering across pagination (Page 1, 2, 3...) for the same session seed.
 */
export function applySessionSeededRanking<T extends { id: string }>(
  items: T[],
  getScore: (item: T) => number,
  seed: string = 'session_default',
  jitterWeight: number = 24, // Controls fair randomness range (+/- 12 pts)
): (T & { rankScore: number })[] {
  return items
    .map((item) => {
      const base = getScore(item);
      const prng = createSeededRandom(`${seed}:${item.id}`);
      // Jitter range: -jitterWeight/2 to +jitterWeight/2
      const jitter = (prng() - 0.5) * jitterWeight;
      const rankScore = Number((base + jitter).toFixed(3));
      return { ...item, rankScore };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}
