import { 
  PrismaClient, 
  Role, 
  VendorTier, 
  VendorStatus, 
  GigStatus, 
  JobStatus, 
  OfferStatus, 
  OrderStatus, 
  MilestoneStatus, 
  PaymentStatus, 
  DisputeStatus, 
  NotificationType, 
  TransactionType 
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function cleanDatabase() {
  console.log('🧹 Cleaning existing test data in correct relational sequence...');
  // Delete in reverse dependency order
  await prisma.auditLog.deleteMany();
  await prisma.platformSetting.deleteMany();
  await prisma.savedVendor.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.levelHistory.deleteMany();
  await prisma.levelRule.deleteMany();
  await prisma.familyBoardItem.deleteMany();
  await prisma.familyBoard.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.familyWorkspace.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.disputeMessage.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.review.deleteMany();
  await prisma.bidCreditTransaction.deleteMany();
  await prisma.bidCreditPackage.deleteMany();
  await prisma.earning.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.order.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.job.deleteMany();
  await prisma.event.deleteMany();
  await prisma.portfolioItem.deleteMany();
  await prisma.gigGalleryItem.deleteMany();
  await prisma.gigPackage.deleteMany();
  await prisma.gig.deleteMany();
  await prisma.vendorCategory.deleteMany();
  await prisma.subCategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.adminProfile.deleteMany();
  await prisma.vendorProfile.deleteMany();
  await prisma.clientProfile.deleteMany();
  await prisma.user.deleteMany();
  console.log('✨ Database clean & ready for fresh seed.');
}

async function main() {
  console.log('🌱 Starting Ophir Comprehensive DB Seeding...');
  await cleanDatabase();

  const defaultPassword = await bcrypt.hash('Ophir1234!', 10);

  // =========================================================================
  // 1. ADMIN USER
  // =========================================================================
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@ophir.com',
      passwordHash: defaultPassword,
      role: Role.ADMIN,
      isEmailVerified: true,
      adminProfile: {
        create: {
          name: 'Ophir Operations Director',
        },
      },
    },
    include: { adminProfile: true },
  });
  console.log('✅ Admin created: admin@ophir.com / Ophir1234!');

  // =========================================================================
  // 2. CATEGORIES & SUBCATEGORIES (6 Categories with 3 Subcategories each)
  // =========================================================================
  const categoriesDef = [
    {
      name: 'Photography & Cinema',
      slug: 'photography-cinema',
      description: 'Award-winning visual artisans capturing timeless wedding & celebration heirlooms.',
      icon: '📸',
      subCategories: [
        { name: 'Wedding Photography', slug: 'wedding-photography' },
        { name: 'Cinematic 4K Video & Drone', slug: 'cinematic-video-drone' },
        { name: 'Editorial & Portraiture', slug: 'editorial-portraiture' },
      ],
    },
    {
      name: 'Music & Entertainment',
      slug: 'music-entertainment',
      description: 'High-energy live bands, master emcees, and bespoke party DJs.',
      icon: '🎵',
      subCategories: [
        { name: 'Live Bands & Orchestras', slug: 'live-bands' },
        { name: 'Wedding & Gala DJs', slug: 'wedding-gala-djs' },
        { name: 'Acoustic Soloists & Duos', slug: 'acoustic-soloists' },
      ],
    },
    {
      name: 'Floral & Event Decor',
      slug: 'floral-decor',
      description: 'Sculptural floral installations, organic balloon arches, and bespoke event styling.',
      icon: '💐',
      subCategories: [
        { name: 'Floral Arches & Centerpieces', slug: 'floral-arches' },
        { name: 'Luxury Balloon Backdrops', slug: 'balloon-backdrops' },
        { name: 'Full Venue Table Styling', slug: 'venue-styling' },
      ],
    },
    {
      name: 'Catering & Artisanal Dining',
      slug: 'catering-dining',
      description: 'Gourmet multi-course plated dinners, artisanal buffets, and private chef experiences.',
      icon: '🍽️',
      subCategories: [
        { name: 'Plated 3-Course Galas', slug: 'plated-galas' },
        { name: 'Grazing Tables & Hors d\'oeuvres', slug: 'grazing-tables' },
        { name: 'Wood-fired & Live Stations', slug: 'live-stations' },
      ],
    },
    {
      name: 'Craft Bartending & Mixology',
      slug: 'bartending-mixology',
      description: 'Specialty craft cocktail mobile bars, sommeliers, and interactive bar masters.',
      icon: '🍸',
      subCategories: [
        { name: 'Craft Cocktail Mobile Bars', slug: 'craft-cocktail-bars' },
        { name: 'Champagne Towers & Bubbles', slug: 'champagne-towers' },
        { name: 'Sommelier Wine Tastings', slug: 'wine-tastings' },
      ],
    },
    {
      name: 'Cakes & Milestone Desserts',
      slug: 'cakes-desserts',
      description: 'Custom sculpted milestone cakes, macaron towers, and gourmet dessert tables.',
      icon: '🎂',
      subCategories: [
        { name: 'Tiered Sculpted Wedding Cakes', slug: 'wedding-cakes' },
        { name: 'Macaron Towers & Dessert Bars', slug: 'dessert-bars' },
        { name: 'Artisan Pastry Grazing', slug: 'artisan-pastries' },
      ],
    },
  ];

  const categoryMap = new Map<string, { cat: any; subCats: any[] }>();

  for (const cat of categoriesDef) {
    const createdCat = await prisma.category.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        icon: cat.icon,
        isActive: true,
      },
    });

    const subCats = [];
    for (const sub of cat.subCategories) {
      const createdSub = await prisma.subCategory.create({
        data: {
          name: sub.name,
          slug: sub.slug,
          categoryId: createdCat.id,
        },
      });
      subCats.push(createdSub);
    }

    categoryMap.set(cat.slug, { cat: createdCat, subCats });
  }
  console.log(`✅ ${categoriesDef.length} Categories and 18 Subcategories seeded.`);

  // =========================================================================
  // 3. VENDOR USERS & PROFILES (6 Elite Vendors)
  // =========================================================================
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
      catSlug: 'photography-cinema',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=80',
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
      catSlug: 'music-entertainment',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1600&q=80',
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
      catSlug: 'floral-decor',
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
      catSlug: 'catering-dining',
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
      catSlug: 'bartending-mixology',
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
      catSlug: 'cakes-desserts',
      avatarUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=400&q=80',
      heroImageUrl: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?auto=format&fit=crop&w=1600&q=80',
    },
  ];

  const vendorMap = new Map<string, any>();

  for (const v of vendorsData) {
    const user = await prisma.user.create({
      data: {
        email: v.email,
        passwordHash: defaultPassword,
        role: Role.VENDOR,
        isEmailVerified: true,
        vendorProfile: {
          create: {
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
        },
      },
      include: { vendorProfile: true },
    });

    const vendorProfile = user.vendorProfile!;
    vendorMap.set(v.slug, vendorProfile);

    // Link VendorCategory
    const catData = categoryMap.get(v.catSlug);
    if (catData) {
      await prisma.vendorCategory.create({
        data: {
          vendorProfileId: vendorProfile.id,
          categoryId: catData.cat.id,
        },
      });
    }

    // Add 3 Portfolio Items
    await prisma.portfolioItem.createMany({
      data: [
        {
          vendorProfileId: vendorProfile.id,
          url: v.heroImageUrl,
          caption: `${v.businessName} - Signature Milestone Showcase`,
          sortOrder: 1,
        },
        {
          vendorProfileId: vendorProfile.id,
          url: v.avatarUrl,
          caption: `${v.businessName} - Artisan in action`,
          sortOrder: 2,
        },
        {
          vendorProfileId: vendorProfile.id,
          url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80',
          caption: `${v.businessName} - Celebration Highlights`,
          sortOrder: 3,
        },
      ],
    });
  }
  console.log(`✅ ${vendorsData.length} Vendors created with profiles, categories, and portfolios.`);

  // =========================================================================
  // 4. CLIENT USERS & PROFILES (6 Realistic Event Hosts)
  // =========================================================================
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

  const clientMap = new Map<string, any>();

  for (const c of clientsData) {
    const user = await prisma.user.create({
      data: {
        email: c.email,
        passwordHash: defaultPassword,
        role: Role.CLIENT,
        isEmailVerified: true,
        clientProfile: {
          create: {
            displayName: c.displayName,
            phone: c.phone,
            city: c.city,
            state: c.state,
            avatarUrl: c.avatarUrl,
          },
        },
      },
      include: { clientProfile: true },
    });

    const clientProfile = user.clientProfile!;
    clientMap.set(c.email, clientProfile);

    // Add Saved Payment Method
    await prisma.paymentMethod.create({
      data: {
        clientProfileId: clientProfile.id,
        stripePaymentMethodId: `pm_${c.displayName.toLowerCase().replace(/\s+/g, '_')}_card`,
        type: 'card',
        brand: 'Visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
        isDefault: true,
      },
    });

    // Create Family Workspace
    const workspace = await prisma.familyWorkspace.create({
      data: {
        ownerId: clientProfile.id,
        name: `${c.displayName}'s Celebration Hub`,
      },
    });

    // Create a Family Board
    const board = await prisma.familyBoard.create({
      data: {
        familyWorkspaceId: workspace.id,
        title: 'Main Celebration Planning Board',
        notes: 'Shortlisted artisans, collective guest votes, and milestone budget allocations.',
      },
    });

    // Add Family Board Item
    await prisma.familyBoardItem.create({
      data: {
        boardId: board.id,
        title: 'Luminary Studios - Full Wedding Cinematography',
        notes: 'Recommended by Sarah. Includes 4K drone flyovers and 48-hour social reel.',
        status: 'SHORTLISTED',
        votes: { yes: 4, no: 0, maybe: 1 },
      },
    });
  }
  console.log(`✅ ${clientsData.length} Clients created with profiles, payment methods, and Family Hubs.`);

  // =========================================================================
  // 5. GIGS / PRODUCTS: MIN 5 CATEGORIES, MIN 10 GIGS EACH (Total: 60 Gigs!)
  // =========================================================================
  console.log('📦 Seeding 10 detailed Gigs for EACH of the 6 Categories (60 Gigs Total)...');

  const vendorList = Array.from(vendorMap.values());

  const gigTemplates: Record<string, Array<{ title: string; price: number; tags: string[]; desc: string; img: string }>> = {
    'photography-cinema': [
      {
        title: 'Full-Day 4K Cinematic Wedding Film & Drone Coverage',
        price: 1850,
        tags: ['Wedding', 'Cinematic', 'Drone', '4K', 'Heirloom'],
        desc: 'Complete 10-hour two-cinematographer wedding narrative. Includes FAA-licensed aerial drone flyovers, raw audio capture of vows, and a 5-minute teaser delivered in 48 hours.',
        img: 'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Editorial Milestone Gala & Engagement Photography',
        price: 950,
        tags: ['Editorial', 'Portraits', 'Engagement', 'Studio'],
        desc: 'Vogue-inspired portraits with creative strobe lighting and custom editorial direction. Full color-graded gallery delivered in 5 business days.',
        img: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Heirloom 35mm Analog Film & Digital Hybrid Wedding Coverage',
        price: 1400,
        tags: ['Film', '35mm', 'Vintage', 'Wedding'],
        desc: 'Artisanal analog rolls processed by hand alongside sharp modern digital captures. Complete with physical archival heirloom prints.',
        img: 'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Luxury 360 Video Booth & Instant Social Reel Station',
        price: 750,
        tags: ['PhotoBooth', '360Video', 'Social', 'Interactive'],
        desc: 'Interactive revolving 4K slow-motion camera platform with custom celebration overlay, high-output studio lights, and instant guest AirDrop.',
        img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Corporate Executive Summit & Gala Documentation',
        price: 1200,
        tags: ['Corporate', 'Summit', 'Gala', 'Candid'],
        desc: 'Discreet, high-speed photography covering keynote addresses, award banquets, and networking cocktails with same-day press highlights.',
        img: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Milestone Birthday Party Candid & Family Portraits',
        price: 650,
        tags: ['Birthday', 'Family', 'Candids', 'Portraits'],
        desc: 'Capture joy, multi-generational hugs, cake cutting, and heartfelt speeches with vibrant natural light photography.',
        img: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Micro-Wedding & Intimate Elopement 4-Hour Narrative',
        price: 850,
        tags: ['Elopement', 'Intimate', 'Ceremony', 'Storytelling'],
        desc: 'Focused coverage crafted for intimate ceremonies up to 50 guests, capturing emotional close-ups and relaxed creative couples portraits.',
        img: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Sunset Rooftop Cinema Reel & Drone Flyover',
        price: 900,
        tags: ['Drone', 'Sunset', 'Rooftop', 'ChicagoSkyline'],
        desc: 'Dramatic golden-hour drone sweep over the skyline paired with ground-level gimbal cinematography for anniversary and launch parties.',
        img: 'https://images.unsplash.com/photo-1502635385003-ee1e6a1a742d?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Multi-Generational Golden Anniversary Portrait Suite',
        price: 700,
        tags: ['Anniversary', 'FamilySuite', 'StudioLighting'],
        desc: 'Studio-grade mobile setup brought to your venue for formal family groupings, grandchild portraits, and heirloom prints.',
        img: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Destination Celebration Documentary Filmmaker',
        price: 2600,
        tags: ['Destination', 'MultiDay', 'Cinema', 'Documentary'],
        desc: 'Comprehensive multi-day coverage including welcome dinner, rehearsal celebrations, wedding day, and farewell brunch cinema.',
        img: 'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=800&q=80',
      },
    ],
    'music-entertainment': [
      {
        title: 'High-Energy DJ & Live Interactive MC for Milestone Celebrations',
        price: 850,
        tags: ['DJ', 'Emcee', 'SoundSystem', 'Lighting'],
        desc: 'State-of-the-art QSC sound array, wireless microphones, intelligent lighting, and an engaging non-cheesy master of ceremonies.',
        img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: '7-Piece Luxury Brass & Motown Live Party Band',
        price: 3200,
        tags: ['LiveBand', 'Brass', 'Motown', 'PopHits'],
        desc: 'Sensational live rhythm section with full horn line performing timeless soul, funk, and modern billboard hits to keep the dancefloor overflowing.',
        img: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Acoustic Guitar & Vocals Cocktail Hour Duo',
        price: 650,
        tags: ['Acoustic', 'CocktailHour', 'IndiePop', 'Mellow'],
        desc: 'Harmonious acoustic renditions of indie classics, classic rock, and modern pop tailored for cocktail hours and garden receptions.',
        img: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Classical String Quartet for Grand Ceremony & Cocktail',
        price: 900,
        tags: ['StringQuartet', 'Classical', 'BridalEntrance', 'BridgertonStyle'],
        desc: 'World-class conservatory string musicians performing romantic classical staples alongside contemporary pop arrangements Bridgerton-style.',
        img: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Ibiza-Style Live Saxophonist & Club DJ Fusion',
        price: 1100,
        tags: ['Saxophone', 'ClubFusion', 'HouseBeats', 'VIPGala'],
        desc: 'Live wireless saxophone jamming through the crowd over energetic house, lounge, and pop DJ tracks for an electrifying party atmosphere.',
        img: 'https://images.unsplash.com/photo-1525994886773-080587e161c2?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Silent Disco 3-Channel Headphone Experience',
        price: 800,
        tags: ['SilentDisco', 'Headphones', 'MultiDJ', 'LateNight'],
        desc: '100 wireless multi-channel LED glow headphones with 3 live DJ channels catering to all music preferences with zero noise ordinance issues.',
        img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Vintage Jazz & Swing Quintet for Black-Tie Galas',
        price: 1800,
        tags: ['Jazz', 'Swing', 'BlackTie', 'GatsbyEra'],
        desc: 'Sophisticated 1920s-1950s Great American Songbook jazz with upright bass, velvet crooner vocals, and brushed drums.',
        img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Ambient Mood Lighting & Architectural Room Uplighting',
        price: 450,
        tags: ['Uplighting', 'LightingDesign', 'Ambiance', 'Wireless'],
        desc: '16 wireless battery-powered RGBWA+UV uplights programmed to match your celebration color palette perfectly.',
        img: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Live Harpist for Romantic Vow Exchanges',
        price: 550,
        tags: ['Harpist', 'Romantic', 'Ceremony', 'Intimate'],
        desc: 'Exquisite acoustic concert pedal harpist creating an enchanting, heavenly ambiance for bridal walks and guest seating.',
        img: 'https://images.unsplash.com/photo-1520523839898-507124cd5333?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Retro Vinyl Record DJ with Custom Wooden Console',
        price: 950,
        tags: ['Vinyl', 'WarmAudio', 'Turntables', 'Analog'],
        desc: 'Warm, crackling authentic vinyl records spun on handcrafted walnut turntables. Funk, soul, Motown, and classic disco.',
        img: 'https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=800&q=80',
      },
    ],
    'floral-decor': [
      {
        title: 'Organic Pastel Floral Balloon Arch & Luxury Photo Backdrops',
        price: 650,
        tags: ['BalloonArch', 'Floral', 'Pastel', 'Backdrop'],
        desc: 'Double-stuffed matte organic balloons intertwined with fresh seasonal eucalyptus and roses, customized to any celebration theme.',
        img: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Grand Floral Moon Gate & Ceremony Arch Installation',
        price: 1250,
        tags: ['FloralArch', 'MoonGate', 'Ceremony', 'Roses'],
        desc: '8-foot full circular moon gate bursting with white garden roses, hydrangeas, delphinium, and trailing Italian ruscus.',
        img: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Elevated Tall Crystal Table Centerpiece Suite (10 Tables)',
        price: 1500,
        tags: ['Centerpieces', 'Tablescape', 'LuxuryDinner', 'Hydrangeas'],
        desc: 'Tall glass trumpet vases adorned with lush floral spheres of peonies, ranunculus, and dripping greenery paired with glowing pillar candles.',
        img: 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Suspended Ceiling Floral Cloud & Edison Bulb Chandelier',
        price: 1900,
        tags: ['Suspension', 'FloralCloud', 'EdisonBulbs', 'Installation'],
        desc: 'Dramatic hanging floral clouds floating above the dancefloor or head table, intertwined with warm vintage dimmable filament bulbs.',
        img: 'https://images.unsplash.com/photo-1507504031003-b417219a0fde?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Custom Neon Sign & Preserved Boxwood Hedge Wall',
        price: 450,
        tags: ['NeonSign', 'HedgeWall', 'PhotoBoothBackdrop', 'Greenery'],
        desc: '8x8ft plush boxwood hedge wall mounted with your choice of warm white custom neon signage ("Better Together", "Cheers", or custom name).',
        img: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Boho Pampas Grass & Terracotta Botanical Styling',
        price: 850,
        tags: ['Boho', 'PampasGrass', 'Terracotta', 'DriedFlorals'],
        desc: 'Sun-drenched bohemian styling with fluffy bleached pampas grass, preserved palm spears, and artisanal terracotta vessels.',
        img: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Candlelight Dream: 100 Stemmed Glass Votives & Floating Hurricanes',
        price: 550,
        tags: ['Candlelight', 'Hurricanes', 'Romantic', 'WarmGlow'],
        desc: 'Over 100 varying height glass cylinder candles with hand-poured soy wax creating an intimate, hypnotic golden glow down long banquet tables.',
        img: 'https://images.unsplash.com/photo-1478147427282-58a87a120781?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Bridal Bouquet & Boutonnière Couture Botanical Collection',
        price: 400,
        tags: ['Bouquet', 'Boutonniere', 'SilkRibbon', 'LuxuryBotanicals'],
        desc: 'Hand-tied organic bridal bouquet with silk hand-dyed ribbons, matching bridesmaid posies, and refined magnetic boutonnières.',
        img: 'https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Kids Milestone Fantasy Balloon Castle & Marquee Numbers',
        price: 600,
        tags: ['MarqueeNumbers', 'KidsBirthday', 'BalloonSculpture'],
        desc: '4ft LED marquee illuminated numbers flanked by metallic chrome and pastel balloon garlands with organic starburst foil accents.',
        img: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Full Venue Event Styling & Directorial Setup Consultation',
        price: 2200,
        tags: ['FullProduction', 'Styling', 'DayOfExecution', 'Turnkey'],
        desc: 'Complete aesthetic coordination: linens, specialty chairs, place setting chargers, stationery calligraphy, and day-of setup breakdown.',
        img: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80',
      },
    ],
    'catering-dining': [
      {
        title: 'Plated 3-Course Gourmet Gala Dinner (50 Guests)',
        price: 3500,
        tags: ['PlatedDinner', 'Gourmet', '3Course', 'FineDining'],
        desc: 'Artisanal heirloom tomato burrata, prime pan-seared beef filet or Chilean sea bass, and decadent molten dark chocolate dome.',
        img: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: '12-Foot Luxury Mediterranean Grazing Table & Charcuterie',
        price: 950,
        tags: ['GrazingTable', 'Charcuterie', 'ArtisanalCheeses', 'CocktailHour'],
        desc: 'Abundant display of imported prosciutto di Parma, aged manchego, fresh figs, honeycomb, artisan crackers, and edible flowers.',
        img: 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Live Handcrafted Neapolitan Wood-Fired Pizza Station',
        price: 1200,
        tags: ['PizzaStation', 'WoodFired', 'Interactive', 'ComfortFood'],
        desc: 'Portable Italian wood-fired oven cranking out crispy 90-second personal pizzas with San Marzano tomatoes and fior di latte mozzarella.',
        img: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Passed Upscale Cocktail Hors d’oeuvres (6 Selections)',
        price: 850,
        tags: ['HorsDoeuvres', 'PassedAppetizers', 'Canapes', 'Cocktails'],
        desc: 'Bite-sized culinary perfection: truffle beef tartare spoons, tuna poke crisps, lobster rolls, and mini brie & fig tarts.',
        img: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'South Asian Fusion Feast: Biryani & Tandoori Live Grills',
        price: 2400,
        tags: ['Biryani', 'Tandoori', 'SouthAsian', 'LiveGrills'],
        desc: 'Authentic slow-dum cooked saffron mutton biryani, chicken malai tikka grilled live on skewers, garlic naan, and raita stations.',
        img: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Interactive Sushi Chef Omakase Bar for Private Celebrations',
        price: 1800,
        tags: ['Sushi', 'Omakase', 'LiveChef', 'RawBar'],
        desc: 'Private master sushi chef slicing fresh Bluefin tuna, Hokkaido scallops, and King salmon nigiri directly onto guest plates.',
        img: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Farmhouse Family-Style Shared Feast with Heritage Meats',
        price: 2100,
        tags: ['FamilyStyle', 'HeritageMeats', 'Organic', 'Rustic'],
        desc: 'Large warm wooden platters brought to each table: slow-braised short ribs, roasted rosemary root vegetables, and crusty sourdough.',
        img: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Post-Party Late-Night Gourmet Sliders & Loaded Truffle Fries',
        price: 600,
        tags: ['LateNightSnacks', 'Sliders', 'TruffleFries', 'PartyFuel'],
        desc: 'Delivered piping hot at 11:00 PM: Wagyu smash sliders with secret sauce, crispy parmesan truffle fries, and artisanal milkshakes.',
        img: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Vegan & Plant-Based 4-Course Fine Dining Menu',
        price: 1600,
        tags: ['Vegan', 'PlantBased', 'Organic', 'GlutenFreeOptions'],
        desc: 'Elevated plant-based dining: roasted beet carpaccio, wild mushroom risotto with black truffle, and cashew milk panna cotta.',
        img: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'European Brunch Buffet with Mimosa & Belgian Waffle Bar',
        price: 1100,
        tags: ['Brunch', 'WaffleBar', 'Mimosas', 'Pastries'],
        desc: 'Freshly baked croissants, smoked salmon bagels, live Belgian waffle station with berry compotes, and prosecco carafes.',
        img: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=800&q=80',
      },
    ],
    'bartending-mixology': [
      {
        title: 'Full Craft Cocktail Mobile Bar Package with Signature Drinks',
        price: 850,
        tags: ['CraftCocktails', 'MobileBar', 'SignatureDrinks', 'Mixology'],
        desc: 'Handmade syrups, fresh squeezed citrus, 3 bespoke his/hers signature drinks, ice program, glassware, and 2 certified mixologists.',
        img: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: '5-Tier Crystal Champagne Coupe Tower & Pour Experience',
        price: 650,
        tags: ['ChampagneTower', 'CoupeGlasses', 'SparklingWine', 'GrandEntrance'],
        desc: 'Dazzling 55-glass vintage crystal coupe tower setup with drip tray and choreographed sparkling wine fountain pour.',
        img: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Smoked Bourbon & Tequila Tasting Lounge Experience',
        price: 950,
        tags: ['Bourbon', 'Tequila', 'SmokedCocktails', 'VIPLounge'],
        desc: 'Oak and cherry wood-smoked Old Fashioneds, artisanal mezcal flights, crystal snifters, and an expert spirits educator.',
        img: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Zero-Proof Botanical Mocktail Bar (Alcohol-Free)',
        price: 600,
        tags: ['Mocktails', 'ZeroProof', 'Wellness', 'Botanicals'],
        desc: 'Complex, sophisticated alcohol-free spirits (Seedlip, Ghia), house elderflower tonics, dehydrated citrus, and fresh herb bouquets.',
        img: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Italian Aperitivo & Spritz Cart with Vintage Prosecco Tap',
        price: 750,
        tags: ['SpritzCart', 'AperolSpritz', 'ProseccoTap', 'ItalianAperitivo'],
        desc: 'Charming retro white cart dispensing chilled prosecco, Aperol, Campari, artisanal sodas, and colossal green Castelvetrano olives.',
        img: 'https://images.unsplash.com/photo-1560512823-829485b8bf24?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Flair Bartender Interactive Fire & Juggling Performance',
        price: 700,
        tags: ['FlairBartender', 'FirePerformance', 'Showmanship', 'PartyEnergy'],
        desc: 'World-championship flair mixologist performing synchronized bottle juggling, shaker balance tricks, and flaming cocktail finishes.',
        img: 'https://images.unsplash.com/photo-1574096079513-d8259312b785?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Curated Sommelier Wine Pairing for Multi-Course Dinners',
        price: 800,
        tags: ['Sommelier', 'WinePairing', 'OldWorldWines', 'Gourmet'],
        desc: 'Certified sommelier guiding guests through hand-selected Old World & biodynamic wine pairings that elevate each course.',
        img: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Bespoke Monogrammed Ice Cube Program (Clear Ice)',
        price: 350,
        tags: ['ClearIce', 'Monogram', 'IceStamps', 'CocktailLuxury'],
        desc: '150 crystal-clear 2x2 inch artisanal ice cubes stamped with your wedding monogram or celebration crest.',
        img: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Espresso Martini Live Shaken Station with Coffee Beans Bar',
        price: 650,
        tags: ['EspressoMartini', 'FreshEspresso', 'LateNightDrinks', 'VodkaCocktails'],
        desc: 'Freshly pulled espresso shots shaken with vanilla vodka, Kahlúa, and dark cocoa bitters, garnished with custom cocoa dust stencils.',
        img: 'https://images.unsplash.com/photo-1545438102-799c3991ffb2?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Tiki Polynesian Tropical Oasis Bar & Ceramic Mugs',
        price: 900,
        tags: ['TikiBar', 'Tropical', 'MaiTai', 'ExoticCocktails'],
        desc: 'Bamboo cocktail bar with authentic Mai Tais, Zombie punches, flaming garnishes, and whimsical collectible ceramic tiki mugs.',
        img: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=800&q=80',
      },
    ],
    'cakes-desserts': [
      {
        title: 'Custom 3-Tier Sculpted Milestone Cake & Fondant Art',
        price: 450,
        tags: ['MilestoneCake', 'FondantSculpted', 'WeddingCake', 'BirthdayCake'],
        desc: 'Three tiers of rich Madagascar bourbon vanilla or Belgian chocolate fudge with handcrafted edible sugar flowers and gold leaf accents.',
        img: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'French Macaron Tower (120 Pieces) in Ombré Color Palette',
        price: 350,
        tags: ['MacaronTower', 'FrenchPatisserie', 'GlutenFree', 'DessertBar'],
        desc: '10-tier freestanding tower of delicate French macarons: pistachio, salted caramel, raspberry rose, passionfruit, and dark chocolate.',
        img: 'https://images.unsplash.com/photo-1569864358642-9d1684040f43?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Artisanal Mini Dessert Shooters & Tartlet Grazing Bar',
        price: 550,
        tags: ['DessertShooters', 'Tartlets', 'KeyLime', 'Tiramisu'],
        desc: '150 miniature gourmet dessert cups: espresso tiramisu, Meyer lemon meringue tartlets, and salted butterscotch panna cotta.',
        img: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Rustic Naked Berry Wedding Cake with Fresh Figs & Rosemary',
        price: 380,
        tags: ['NakedCake', 'RusticWedding', 'FreshBerries', 'Organic'],
        desc: 'Semi-naked lemon elderflower cake brushed with Swiss meringue buttercream and garnished with organic blackberries, figs, and gold dust.',
        img: 'https://images.unsplash.com/photo-1588195538326-c5b1e9f80a1b?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Interactive Flambé S’mores Bar & Artisan Marshmallows',
        price: 420,
        tags: ['SmoresBar', 'Interactive', 'ArtisanMarshmallows', 'CozyDessert'],
        desc: 'Gourmet flavored marshmallows (bourbon vanilla, strawberry swirl), graham crackers, and high-percentage Valrhona chocolate toasted live.',
        img: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Gourmet Gelato Cart with Waffle Cones (4 Flavors)',
        price: 650,
        tags: ['GelatoCart', 'WaffleCones', 'ItalianDessert', 'SummerParty'],
        desc: 'Authentic vintage push cart serving stracciatella, Sicilian pistachio, blood orange sorbetto, and espresso chip in waffle cones.',
        img: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Kids Themed Character Milestone Sculpted Buttercream Cake',
        price: 300,
        tags: ['KidsCake', 'CharacterCake', 'Buttercream', 'FunParty'],
        desc: 'Creative sculpted cake for children’s milestones with vibrant hand-piped buttercream textures, rainbow sprinkles, and edible toppers.',
        img: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Gluten-Free & Dairy-Free Raw Vegan Berry Cheesecake Suite',
        price: 400,
        tags: ['VeganCheesecake', 'GlutenFree', 'RawDessert', 'HealthyTreats'],
        desc: 'Decadent cashew cream and coconut oil cheesecakes with almond date crusts and swirls of wild blueberries and dark cocoa.',
        img: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Churros & Hot Mexican Spiced Chocolate Fountain Cart',
        price: 500,
        tags: ['Churros', 'ChocolateFountain', 'CinnamonSugar', 'LateNightSweets'],
        desc: 'Warm golden churros rolled in cinnamon sugar served with cups of rich spiced dark chocolate for dipping.',
        img: 'https://images.unsplash.com/photo-1624300629298-e9de39c13be5?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Donut Wall Installation (100 Artisanal Brioche Donuts)',
        price: 480,
        tags: ['DonutWall', 'BriocheDonuts', 'Glazes', 'CrowdPleaser'],
        desc: 'Eye-catching 7ft wooden wall pegboard filled with freshly fried brioche donuts: matcha glaze, maple bacon, and hibiscus glaze.',
        img: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=800&q=80',
      },
    ],
  };

  const allGigs = [];

  let gigCounter = 1;
  for (const [catSlug, gigsData] of Object.entries(gigTemplates)) {
    const catData = categoryMap.get(catSlug);
    if (!catData) continue;

    for (let i = 0; i < gigsData.length; i++) {
      const gigItem = gigsData[i];
      // Pick a vendor based on category or round robin
      const assignedVendor = vendorList.find(v => v.businessName.toLowerCase().includes(catSlug.split('-')[0])) || vendorList[i % vendorList.length];
      const subCat = catData.subCats[i % catData.subCats.length];
      const gigSlug = `${gigItem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${gigCounter++}`;

      const createdGig = await prisma.gig.create({
        data: {
          vendorProfileId: assignedVendor.id,
          categoryId: catData.cat.id,
          subCategoryId: subCat?.id,
          title: gigItem.title,
          slug: gigSlug,
          description: gigItem.desc,
          status: GigStatus.ACTIVE,
          tags: gigItem.tags,
          faqs: [
            { question: 'What is your cancellation and rescheduling policy?', answer: 'We offer full escrow fund protection with flexible rescheduling up to 14 days before the event date.' },
            { question: 'Do you carry commercial general liability insurance?', answer: 'Yes, we carry a $2,000,000 policy and provide COI certificates directly to your venue coordinator.' }
          ],
        },
      });

      // 3 Packages per Gig
      await prisma.gigPackage.createMany({
        data: [
          {
            gigId: createdGig.id,
            vendorProfileId: assignedVendor.id,
            title: 'Essential Milestone Tier',
            description: 'Core essentials for intimate celebrations up to 50 guests.',
            price: gigItem.price,
            hours: '3-4 Hours',
            turnaround: '48 Hours',
            features: ['Essential service execution', 'Standard equipment setup', 'Dedicated artisan communication'],
            sortOrder: 1,
          },
          {
            gigId: createdGig.id,
            vendorProfileId: assignedVendor.id,
            title: 'Premier Signature Tier',
            description: 'Our most sought-after package with extended hours and premium enhancements.',
            price: Math.round(gigItem.price * 1.5),
            hours: '6-8 Hours',
            turnaround: '24 Hours',
            isPopular: true,
            features: ['Extended celebration coverage', 'Upgraded gear & backup equipment', 'Priority milestone delivery', 'Complimentary custom consultation'],
            sortOrder: 2,
          },
          {
            gigId: createdGig.id,
            vendorProfileId: assignedVendor.id,
            title: 'Luxury Bespoke VIP Tier',
            description: 'Uncompromising grand luxury experience with zero detail overlooked.',
            price: Math.round(gigItem.price * 2.2),
            hours: 'Full Day / Unlimited',
            turnaround: 'Same Day',
            features: ['Full day unlimited execution', 'Dedicated secondary assistant artisan', 'Custom luxury styling & personalized monogramming', 'VIP direct WhatsApp emergency hotline'],
            sortOrder: 3,
          },
        ],
      });

      // 2 Gallery Images per Gig
      await prisma.gigGalleryItem.createMany({
        data: [
          { gigId: createdGig.id, url: gigItem.img, sortOrder: 1, type: 'image' },
          { gigId: createdGig.id, url: assignedVendor.heroImageUrl || gigItem.img, sortOrder: 2, type: 'image' },
        ],
      });

      allGigs.push(createdGig);
    }
  }
  console.log(`✅ 60 Gigs created across 6 categories (10 gigs in each category) with 180 packages and galleries!`);

  // =========================================================================
  // 6. CLIENT EVENTS (6 Celebrations)
  // =========================================================================
  const clientList = Array.from(clientMap.values());
  const eventsData = [
    {
      title: "Emma's 5th Birthday Jubilee Gala",
      occasion: 'Birthday Party',
      eventDate: new Date('2026-11-14T14:00:00Z'),
      guestCount: 65,
      city: 'Chicago',
      location: 'Lincoln Park Conservatory & South Lawn',
      clientProfileId: clientList[1].id, // Emily Carter
    },
    {
      title: 'Sarah & Rohan’s Golden Hour Wedding',
      occasion: 'Wedding',
      eventDate: new Date('2026-10-24T16:00:00Z'),
      guestCount: 180,
      city: 'Chicago',
      location: 'The Langham Chicago (Riverfront Ballroom)',
      clientProfileId: clientList[0].id, // Sarah Jenkins
    },
    {
      title: 'Adams Silver 25th Wedding Anniversary',
      occasion: 'Anniversary',
      eventDate: new Date('2026-11-20T18:00:00Z'),
      guestCount: 90,
      city: 'Evanston',
      location: 'Lakefront Heritage Ballroom',
      clientProfileId: clientList[3].id, // David Vance
    },
    {
      title: 'TechForward Annual Executive Summit & Gala',
      occasion: 'Corporate Gala',
      eventDate: new Date('2026-12-05T19:00:00Z'),
      guestCount: 220,
      city: 'Naperville',
      location: 'Hotel Arista Grand Pavilion',
      clientProfileId: clientList[2].id, // Marcus Sterling
    },
    {
      title: 'Elena’s Midsummer Garden & Cocktail Mixer',
      occasion: 'Private Social',
      eventDate: new Date('2026-11-28T17:00:00Z'),
      guestCount: 45,
      city: 'Oak Park',
      location: 'Pleasant Home Victorian Estate',
      clientProfileId: clientList[4].id, // Elena Rostova
    },
    {
      title: 'Baby Davis Autumn Harvest Welcome Shower',
      occasion: 'Baby Shower',
      eventDate: new Date('2026-12-12T13:00:00Z'),
      guestCount: 50,
      city: 'Chicago',
      location: 'Greenhouse Loft, Chicago',
      clientProfileId: clientList[5].id, // Jessica Davis
    },
  ];

  const createdEvents = [];
  for (const ev of eventsData) {
    const created = await prisma.event.create({
      data: ev,
    });
    createdEvents.push(created);
  }
  console.log(`✅ ${createdEvents.length} Client Events created.`);

  // =========================================================================
  // 7. CLIENT JOBS (RFPs with Bidding Proposals from Vendors)
  // =========================================================================
  const jobsData = [
    {
      title: "High-Energy DJ & Emcee for Emma's 5th Birthday Party",
      clientProfileId: clientList[1].id,
      eventId: createdEvents[0].id,
      occasion: 'Birthday Party',
      eventDate: new Date('2026-11-14T14:00:00Z'),
      location: 'Lincoln Park, Chicago',
      guestCount: 65,
      budgetMin: 400,
      budgetMax: 700,
      description: 'Looking for a charismatic DJ who can play family-friendly dance music and lead fun kids games for 4 hours. High energy required!',
      status: JobStatus.OPEN,
    },
    {
      title: 'Full-Day Wedding Cinema with 48h Teaser Reel & Drone',
      clientProfileId: clientList[0].id,
      eventId: createdEvents[1].id,
      occasion: 'Wedding',
      eventDate: new Date('2026-10-24T16:00:00Z'),
      location: 'The Langham, Chicago',
      guestCount: 180,
      budgetMin: 1500,
      budgetMax: 2500,
      description: 'Seeking a high-end videographer to capture our morning preparations, ceremony, cocktail hour, and dancefloor madness.',
      status: JobStatus.OPEN,
    },
    {
      title: 'Adams Silver Anniversary Custom 3-Tier Cake & Macaron Tower',
      clientProfileId: clientList[3].id,
      eventId: createdEvents[2].id,
      occasion: 'Anniversary',
      eventDate: new Date('2026-11-20T18:00:00Z'),
      location: 'Evanston, IL',
      guestCount: 90,
      budgetMin: 350,
      budgetMax: 650,
      description: 'Need a sculpted anniversary cake decorated with silver luster dust and a tower of French macarons.',
      status: JobStatus.OPEN,
    },
    {
      title: 'Plated 3-Course Dinner & Wine Service for Corporate Gala (120 Guests)',
      clientProfileId: clientList[2].id,
      eventId: createdEvents[3].id,
      occasion: 'Corporate Gala',
      eventDate: new Date('2026-12-05T19:00:00Z'),
      location: 'Naperville, IL',
      guestCount: 120,
      budgetMin: 3000,
      budgetMax: 5000,
      description: 'Annual corporate celebration requiring plated filet and sea bass options, bread baskets, salad course, and dessert.',
      status: JobStatus.OPEN,
    },
    {
      title: 'Craft Cocktail Mobile Bar & Flair Mixologists for Garden Mixer',
      clientProfileId: clientList[4].id,
      eventId: createdEvents[4].id,
      occasion: 'Private Social',
      eventDate: new Date('2026-11-28T17:00:00Z'),
      location: 'Oak Park, IL',
      guestCount: 45,
      budgetMin: 600,
      budgetMax: 1000,
      description: 'Seeking 2 mixologists to run a craft cocktail bar for 45 guests with 3 signature drinks and custom ice.',
      status: JobStatus.OPEN,
    },
    {
      title: 'Pastel Floral Balloon Arch & Backdrops for Baby Shower',
      clientProfileId: clientList[5].id,
      eventId: createdEvents[5].id,
      occasion: 'Baby Shower',
      eventDate: new Date('2026-12-12T13:00:00Z'),
      location: 'Greenhouse Loft, Chicago',
      guestCount: 50,
      budgetMin: 400,
      budgetMax: 800,
      description: 'Autumn themed organic balloon garland with dried palms, pampas grass, and a custom circular welcome sign.',
      status: JobStatus.OPEN,
    },
  ];

  const createdJobs = [];
  for (let i = 0; i < jobsData.length; i++) {
    const jd = jobsData[i];
    const createdJob = await prisma.job.create({
      data: jd,
    });
    createdJobs.push(createdJob);

    // Add 2 Vendor Offers for each Job
    const vendorA = vendorList[i % vendorList.length];
    const vendorB = vendorList[(i + 1) % vendorList.length];

    await prisma.offer.create({
      data: {
        jobId: createdJob.id,
        vendorProfileId: vendorA.id,
        price: Number(jd.budgetMin) + 50,
        message: `Hello! ${vendorA.businessName} would love to partner with you for ${jd.title}. We have 10+ years experience and 100% verified insurance.`,
        status: OfferStatus.PENDING,
        bidCreditUsed: 2,
      },
    });

    await prisma.offer.create({
      data: {
        jobId: createdJob.id,
        vendorProfileId: vendorB.id,
        price: Number(jd.budgetMax) - 50,
        message: `Greetings! We specialize in premium execution. Included in our quote are full setup, teardown, and priority milestone delivery.`,
        status: OfferStatus.PENDING,
        bidCreditUsed: 2,
      },
    });
  }
  console.log(`✅ ${createdJobs.length} RFP Jobs created with 12 Vendor Offers.`);

  // =========================================================================
  // 8. ORDERS & ESCROW MILESTONES (6 Real Orders)
  // =========================================================================
  const ordersData = [
    {
      orderNumber: 'OPH-20455',
      clientProfileId: clientList[0].id, // Sarah Jenkins
      vendorProfileId: vendorList[1].id, // Windy City Sound
      eventId: createdEvents[1].id,
      subtotal: 809.52,
      platformFee: 40.48,
      grandTotal: 850.00,
      status: OrderStatus.ACTIVE,
      deliveryNotes: 'Wedding Reception DJ & Sound for The Langham Ballroom.',
    },
    {
      orderNumber: 'OPH-20448',
      clientProfileId: clientList[1].id, // Emily Carter
      vendorProfileId: vendorList[0].id, // Luminary Studios
      eventId: createdEvents[0].id,
      subtotal: 1761.90,
      platformFee: 88.10,
      grandTotal: 1850.00,
      status: OrderStatus.IN_PROGRESS,
      deliveryNotes: 'Full-Day 4K Cinema & Drone coverage for Emma’s 5th Birthday Gala.',
    },
    {
      orderNumber: 'OPH-20432',
      clientProfileId: clientList[3].id, // David Vance
      vendorProfileId: vendorList[2].id, // Bloom & Petal
      eventId: createdEvents[2].id,
      subtotal: 1142.86,
      platformFee: 57.14,
      grandTotal: 1200.00,
      status: OrderStatus.COMPLETED,
      deliveryNotes: 'Silver 25th Anniversary Custom Floral Arches & Table Styling.',
    },
    {
      orderNumber: 'OPH-20419',
      clientProfileId: clientList[2].id, // Marcus Sterling
      vendorProfileId: vendorList[3].id, // Epicurean Bites
      eventId: createdEvents[3].id,
      subtotal: 4285.71,
      platformFee: 214.29,
      grandTotal: 4500.00,
      status: OrderStatus.ACTIVE,
      deliveryNotes: 'Plated 3-course dinner for 120 executives at Hotel Arista.',
    },
    {
      orderNumber: 'OPH-20512',
      clientProfileId: clientList[4].id, // Elena Rostova
      vendorProfileId: vendorList[4].id, // Velvet Pour
      eventId: createdEvents[4].id,
      subtotal: 714.29,
      platformFee: 35.71,
      grandTotal: 750.00,
      status: OrderStatus.IN_PROGRESS,
      deliveryNotes: 'Mobile craft cocktail bar & flair show for garden mixer.',
    },
    {
      orderNumber: 'OPH-20515',
      clientProfileId: clientList[5].id, // Jessica Davis
      vendorProfileId: vendorList[5].id, // Sweet Delights
      eventId: createdEvents[5].id,
      subtotal: 476.19,
      platformFee: 23.81,
      grandTotal: 500.00,
      status: OrderStatus.COMPLETED,
      deliveryNotes: 'Autumn baby shower tiered cake and French macaron tower.',
    },
  ];

  const createdOrders = [];

  for (const od of ordersData) {
    const createdOrder = await prisma.order.create({
      data: {
        orderNumber: od.orderNumber,
        clientProfileId: od.clientProfileId,
        vendorProfileId: od.vendorProfileId,
        eventId: od.eventId,
        subtotal: od.subtotal,
        platformFee: od.platformFee,
        grandTotal: od.grandTotal,
        status: od.status,
        deliveryNotes: od.deliveryNotes,
        stripePaymentIntentId: `pi_test_${od.orderNumber.toLowerCase()}`,
      },
    });
    createdOrders.push(createdOrder);

    // 3 Milestones per Order (30%, 50%, 20%)
    const m1Amount = Math.round(od.grandTotal * 0.3);
    const m2Amount = Math.round(od.grandTotal * 0.5);
    const m3Amount = od.grandTotal - m1Amount - m2Amount;

    const isDone = od.status === OrderStatus.COMPLETED;

    await prisma.milestone.createMany({
      data: [
        {
          orderId: createdOrder.id,
          label: 'Milestone 1 • Booking Retainer & Concept Finalization (30%)',
          percentage: 30,
          amount: m1Amount,
          status: MilestoneStatus.RELEASED,
          releasedAt: new Date(Date.now() - 7 * 86400000),
          sortOrder: 1,
        },
        {
          orderId: createdOrder.id,
          label: 'Milestone 2 • Day-of Event Arrival & Setup Execution (50%)',
          percentage: 50,
          amount: m2Amount,
          status: isDone ? MilestoneStatus.RELEASED : MilestoneStatus.LOCKED,
          releasedAt: isDone ? new Date(Date.now() - 1 * 86400000) : null,
          sortOrder: 2,
        },
        {
          orderId: createdOrder.id,
          label: 'Milestone 3 • Final Deliverable Approval & Asset Sign-off (20%)',
          percentage: 20,
          amount: m3Amount,
          status: isDone ? MilestoneStatus.RELEASED : MilestoneStatus.LOCKED,
          releasedAt: isDone ? new Date() : null,
          sortOrder: 3,
        },
      ],
    });

    // Create Escrow Deposit Transaction
    await prisma.transaction.create({
      data: {
        txRef: `TX-DEP-${od.orderNumber}`,
        orderId: createdOrder.id,
        clientProfileId: od.clientProfileId,
        vendorProfileId: od.vendorProfileId,
        type: TransactionType.ESCROW_DEPOSIT,
        amount: od.grandTotal,
        fee: od.platformFee,
        net: od.subtotal,
        status: PaymentStatus.SUCCEEDED,
        description: `Escrow funds custody lock for ${od.orderNumber}`,
      },
    });
  }
  console.log(`✅ ${createdOrders.length} Escrow Orders created with Milestones and Ledger Transactions.`);

  // =========================================================================
  // 9. REVIEWS & RATINGS (6 Verified Reviews with Vendor Replies)
  // =========================================================================
  const reviewsData = [
    {
      orderId: createdOrders[0].id,
      clientProfileId: createdOrders[0].clientProfileId,
      vendorProfileId: createdOrders[0].vendorProfileId,
      rating: 5,
      title: 'Unbelievable energy on the dancefloor!',
      comment: 'Marcus from Windy City Sound kept our 180 guests dancing until the venue turned on the lights. Sound was pristine, transitions were seamless, and he handled announcements with total class.',
      vendorReply: 'Thank you so much Sarah! It was an absolute honor DJing your celebration. Cheers to you and Rohan!',
      isPublished: true,
    },
    {
      orderId: createdOrders[1].id,
      clientProfileId: createdOrders[1].clientProfileId,
      vendorProfileId: createdOrders[1].vendorProfileId,
      rating: 5,
      title: 'Captured the magic of Emma’s 5th birthday perfectly',
      comment: 'The drone footage over Lincoln Park Conservatory was breathtaking! The teaser reel was delivered in less than 48 hours and had all the grandparents crying tears of joy.',
      vendorReply: 'Such a joyous celebration Emily! Emma is a natural star in front of the lens.',
      isPublished: true,
    },
    {
      orderId: createdOrders[2].id,
      clientProfileId: createdOrders[2].clientProfileId,
      vendorProfileId: createdOrders[2].vendorProfileId,
      rating: 5,
      title: 'The floral arches took everyone’s breath away',
      comment: 'Bloom & Petal Studio exceeded all expectations for our 25th anniversary. The botanical moon gate was a work of fine art. Highly recommend their bespoke team!',
      vendorReply: 'Happy 25th Anniversary David & Alicia! Thank you for trusting us with your silver milestone.',
      isPublished: true,
    },
    {
      orderId: createdOrders[3].id,
      clientProfileId: createdOrders[3].clientProfileId,
      vendorProfileId: createdOrders[3].vendorProfileId,
      rating: 5,
      title: 'Flawless culinary execution for 120 executives',
      comment: 'Every steak was cooked to medium-rare perfection simultaneously. The service staff moved like a Swiss watch. Our executive leadership was thoroughly impressed.',
      vendorReply: 'Thank you Marcus. The TechForward summit is always a pleasure to cater.',
      isPublished: true,
    },
    {
      orderId: createdOrders[4].id,
      clientProfileId: createdOrders[4].clientProfileId,
      vendorProfileId: createdOrders[4].vendorProfileId,
      rating: 4,
      title: 'Delicious craft cocktails and incredible flair show',
      comment: 'The smoked bourbon Old Fashioneds were the talk of the night. Only giving 4 stars because the second ice delivery arrived 15 minutes into cocktail hour, but everything else was 10/10.',
      vendorReply: 'We appreciate the feedback Elena! We have upgraded our mobile insulated chillers to ensure zero ice delays moving forward.',
      isPublished: true,
    },
    {
      orderId: createdOrders[5].id,
      clientProfileId: createdOrders[5].clientProfileId,
      vendorProfileId: createdOrders[5].vendorProfileId,
      rating: 5,
      title: 'The most gorgeous & delicious baby shower cake ever',
      comment: 'The macarons melted in your mouth and the autumn spice cake was moist and sublime. Not a single crumb remained by the end of the shower!',
      vendorReply: 'Wishing you all the joy and health with baby Davis! Thank you Jessica!',
      isPublished: true,
    },
  ];

  for (const rd of reviewsData) {
    await prisma.review.create({
      data: rd,
    });
  }
  console.log(`✅ ${reviewsData.length} Verified Reviews created.`);

  // =========================================================================
  // 10. DISPUTES (5 Real Disputes for Admin & Customer Support Testing)
  // =========================================================================
  const disputesData = [
    {
      orderId: createdOrders[0].id,
      clientProfileId: createdOrders[0].clientProfileId,
      vendorProfileId: createdOrders[0].vendorProfileId,
      reason: 'Wireless mic battery omission during ceremony toasts',
      description: 'The contracted wireless battery packs were not provided, leading to sound cutoff during the birthday toasts. See photo of booth setup with cords draped dangerously across grass.',
      status: DisputeStatus.OPEN,
    },
    {
      orderId: createdOrders[1].id,
      clientProfileId: createdOrders[1].clientProfileId,
      vendorProfileId: createdOrders[1].vendorProfileId,
      reason: 'Drone footage flight path adjustment requested',
      description: 'Client requested aerial flight path revisions over conservatory lawn due to park security perimeter restriction.',
      status: DisputeStatus.UNDER_REVIEW,
    },
    {
      orderId: createdOrders[3].id,
      clientProfileId: createdOrders[3].clientProfileId,
      vendorProfileId: createdOrders[3].vendorProfileId,
      reason: 'Special dietary vegan entree count discrepancy',
      description: 'Venue requested 4 additional gluten-free vegan plates beyond original contracted headcount.',
      status: DisputeStatus.RESOLVED_CLIENT,
      resolution: 'Vendor accommodated additional plates without penalty; split platform fee adjustment logged.',
      resolvedAt: new Date(),
    },
    {
      orderId: createdOrders[4].id,
      clientProfileId: createdOrders[4].clientProfileId,
      vendorProfileId: createdOrders[4].vendorProfileId,
      reason: 'Ice supply delivery timing review',
      description: 'Audit requested on traffic delay clause regarding Chicago expressway construction.',
      status: DisputeStatus.OPEN,
    },
    {
      orderId: createdOrders[5].id,
      clientProfileId: createdOrders[5].clientProfileId,
      vendorProfileId: createdOrders[5].vendorProfileId,
      reason: 'Cake table stand return confirmation',
      description: 'Vendor awaiting return confirmation of vintage silver cake pedestal from event venue staff.',
      status: DisputeStatus.UNDER_REVIEW,
    },
  ];

  for (const dd of disputesData) {
    await prisma.dispute.create({
      data: dd,
    });
  }
  console.log(`✅ ${disputesData.length} Disputes created.`);

  // =========================================================================
  // 11. CONVERSATIONS & CHAT MESSAGES (5 Multi-Turn Conversations)
  // =========================================================================
  const sarahUser = await prisma.user.findUnique({ where: { email: 'sarah@ophir.com' } });
  const emilyUser = await prisma.user.findUnique({ where: { email: 'emily.carter@gmail.com' } });
  const windyUser = await prisma.user.findUnique({ where: { email: 'windycity@ophir.com' } });
  const luminaryUser = await prisma.user.findUnique({ where: { email: 'luminary@ophir.com' } });
  const bloomUser = await prisma.user.findUnique({ where: { email: 'bloom@ophir.com' } });

  if (sarahUser && windyUser && emilyUser && luminaryUser && bloomUser) {
    // Conv 1: Sarah & Windy City Sound
    const conv1 = await prisma.conversation.create({
      data: {
        orderId: createdOrders[0].id,
      },
    });
    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv1.id, userId: sarahUser.id },
        { conversationId: conv1.id, userId: windyUser.id },
      ],
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conv1.id, senderId: sarahUser.id, content: 'Hi Marcus! We are so excited for Saturday. Did you get our updated playlist?' },
        { conversationId: conv1.id, senderId: windyUser.id, content: 'Hello Sarah! Yes, got all 40 tracks. We have the first dance edit timed to exactly 3:15 as requested.' },
        { conversationId: conv1.id, senderId: sarahUser.id, content: 'Fantastic! Can we also do an acoustic intro for the grandmother entrance?' },
        { conversationId: conv1.id, senderId: windyUser.id, content: 'Absolutely! I have the strings arrangement ready on cue. Everything is set!' },
      ],
    });

    // Conv 2: Emily & Luminary Studios
    const conv2 = await prisma.conversation.create({
      data: {
        orderId: createdOrders[1].id,
      },
    });
    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv2.id, userId: emilyUser.id },
        { conversationId: conv2.id, userId: luminaryUser.id },
      ],
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conv2.id, senderId: emilyUser.id, content: 'Hi Amina! Just confirming the drone flight permit for Lincoln Park Conservatory.' },
        { conversationId: conv2.id, senderId: luminaryUser.id, content: 'Hi Emily! FAA Part 107 clearance is approved for Saturday between 2:00 PM and 4:30 PM.' },
        { conversationId: conv2.id, senderId: emilyUser.id, content: 'Wonderful, thank you for handling the city paperwork so smoothly.' },
      ],
    });

    // Conv 3: Sarah & Bloom Studio
    const conv3 = await prisma.conversation.create({});
    await prisma.conversationParticipant.createMany({
      data: [
        { conversationId: conv3.id, userId: sarahUser.id },
        { conversationId: conv3.id, userId: bloomUser.id },
      ],
    });
    await prisma.message.createMany({
      data: [
        { conversationId: conv3.id, senderId: sarahUser.id, content: 'Hi Bloom team! Do you have availability for November 28th?' },
        { conversationId: conv3.id, senderId: bloomUser.id, content: 'Hi Sarah! Yes, we have one morning setup slot open. Would you like a floral arch consultation?' },
      ],
    });
    console.log(`✅ 3 Real Conversations created with 9 Chat Messages.`);
  }

  // =========================================================================
  // 12. NOTIFICATIONS (10 System Notifications)
  // =========================================================================
  if (sarahUser && emilyUser && windyUser && luminaryUser) {
    await prisma.notification.createMany({
      data: [
        {
          userId: sarahUser.id,
          type: NotificationType.MILESTONE_RELEASED,
          title: 'Milestone 1 Retainer Released ($255.00)',
          body: 'Your 30% milestone deposit for order #OPH-20455 was successfully disbursed from the Escrow Vault.',
          link: '/user/orders',
        },
        {
          userId: sarahUser.id,
          type: NotificationType.OFFER_RECEIVED,
          title: 'New Bid Offer Received from Windy City Sound',
          body: 'Windy City Sound submitted a custom proposal for your wedding reception RFP.',
          link: '/user/jobs',
        },
        {
          userId: emilyUser.id,
          type: NotificationType.ORDER_PLACED,
          title: 'Escrow Booking Locked (#OPH-20448)',
          body: 'Your milestone payment of $1,850.00 is now securely locked in the Ophir Escrow Vault.',
          link: '/user/orders',
        },
        {
          userId: windyUser.id,
          type: NotificationType.LEVEL_UP,
          title: 'Congratulations! Level Progress Pro Vendor',
          body: 'You completed 50+ 5-star celebrations and unlocked a 20% platform fee discount!',
          link: '/vendor/levels',
        },
        {
          userId: luminaryUser.id,
          type: NotificationType.PAYOUT_SENT,
          title: 'Stripe Express Payout Transferred ($925.00)',
          body: 'Your milestone release funds have been deposited to your connected bank account.',
          link: '/vendor/payout-settings',
        },
        {
          userId: adminUser.id,
          type: NotificationType.DISPUTE_OPENED,
          title: 'New Dispute Lodged (#OPH-20455)',
          body: 'Client Emily Carter requested arbitration regarding wireless battery pack spec.',
          link: '/admin/disputes',
        },
      ],
    });
    console.log(`✅ 6 Notifications created.`);
  }

  // =========================================================================
  // 13. BID CREDIT PACKAGES & LEVEL RULES
  // =========================================================================
  await prisma.bidCreditPackage.createMany({
    data: [
      { name: 'Starter Pack', credits: 10, price: 19.99, isPopular: false },
      { name: 'Artisan Pro Pack', credits: 25, price: 39.99, isPopular: true },
      { name: 'Agency Growth Pack', credits: 50, price: 69.99, isPopular: false },
      { name: 'Master Enterprise Pack', credits: 100, price: 119.99, isPopular: false },
    ],
  });

  const levelRules = [
    { tier: VendorTier.SPROUT, minOrders: 0, minRating: 0.0, minResponseRate: 0.0, description: 'Newly approved artisan starting on Ophir.' },
    { tier: VendorTier.RISING, minOrders: 5, minRating: 4.5, minResponseRate: 85.0, description: 'Growing artisan with strong client ratings and verified reliability.' },
    { tier: VendorTier.PRO, minOrders: 20, minRating: 4.8, minResponseRate: 90.0, description: 'Elite artisan with consistent on-time delivery and 48-hour escrow releases.' },
    { tier: VendorTier.ELITE, minOrders: 50, minRating: 4.95, minResponseRate: 98.0, description: 'Top 1% luxury artisan, preferred Ophir partner with 35% commission discount.' },
  ];

  for (const rule of levelRules) {
    await prisma.levelRule.create({
      data: rule,
    });
  }
  console.log(`✅ Bid Credit Packages and Level Progression Rules seeded.`);

  console.log('🎉🎉 Complete Ophir Marketplace Dummy Dataset seeded successfully with 100% relational integrity!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
