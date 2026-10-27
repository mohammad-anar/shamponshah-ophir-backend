import { PrismaClient, GigStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function reseedServices() {
  console.log('🚀 Starting Services (Gigs) Reset & Reseed...');

  // Step 1: Disassociate any foreign keys pointing to gigs/packages/categories
  console.log('🧹 Detaching existing orders, reviews, and jobs...');
  await pool.query(`UPDATE orders SET "gigId" = NULL, "packageId" = NULL;`);
  await pool.query(`UPDATE reviews SET "gigId" = NULL;`);
  await pool.query(`UPDATE jobs SET "categoryId" = NULL, "subCategoryId" = NULL;`);

  // Step 2: Delete existing gig-related child rows
  console.log('🗑️  Deleting existing gigs and related data...');
  await pool.query(`DELETE FROM daily_gig_analytics;`);
  await pool.query(`DELETE FROM gig_reports;`);
  await pool.query(`DELETE FROM gig_gallery_items;`);
  await pool.query(`DELETE FROM gig_packages;`);
  await pool.query(`DELETE FROM gigs;`);

  // Step 3: Delete existing categories and subcategories
  await pool.query(`DELETE FROM vendor_categories;`);
  await pool.query(`DELETE FROM sub_categories;`);
  await pool.query(`DELETE FROM categories;`);
  console.log('✅ Old services & categories completely wiped clean.');

  // Step 4: Create requested Categories & Subcategories
  console.log('🌱 Creating new categories requested by user...');
  const categoryDefs = [
    {
      name: 'Bridal Ceremony',
      slug: 'bridal-ceremony',
      description: 'Exclusive bridal packages, bridal makeup, haute couture styling, wedding cinematography, floral mandap & stage decor.',
      sortOrder: 1,
      subcategories: [
        { name: 'Bridal Makeup & Styling', slug: 'bridal-makeup' },
        { name: 'Bridal Photography & Cinema', slug: 'bridal-photography' },
        { name: 'Bridal Stage & Floral Decor', slug: 'bridal-stage-decor' },
        { name: 'Henna & Mehndi Artistry', slug: 'henna-mehndi' },
        { name: 'Complete Bridal Wedding Planning', slug: 'complete-bridal-planning' },
      ],
    },
    {
      name: 'Birthday Party Arrangement',
      slug: 'birthday-party',
      description: 'Themed birthday arrangements, custom milestone cakes, live DJs, interactive entertainment, and balloon arches.',
      sortOrder: 2,
      subcategories: [
        { name: 'Themed Birthday Decor & Lighting', slug: 'birthday-decor' },
        { name: 'Milestone & Artisanal Birthday Cakes', slug: 'birthday-cakes' },
        { name: 'Kids & Family Birthday Entertainment', slug: 'birthday-entertainment' },
        { name: 'Birthday DJ & Sound Stage', slug: 'birthday-dj-sound' },
        { name: 'Full-Service Birthday Planning', slug: 'birthday-planning' },
      ],
    },
    {
      name: 'Cooking for Ceremonies',
      slug: 'cooking-ceremonies',
      description: 'Master ceremonial chefs, grand banquet catering, authentic dum biryanis, live culinary stations, and multi-course feasts.',
      sortOrder: 3,
      subcategories: [
        { name: 'Royal Dum Biryani & Grand Feast', slug: 'royal-biryani-feast' },
        { name: 'Live Banquet & Tandoor Stations', slug: 'live-banquet-stations' },
        { name: 'Ceremonial Sweets & Dessert Tables', slug: 'ceremonial-desserts' },
        { name: 'Artisanal Multi-Course Wedding Dining', slug: 'artisanal-wedding-dining' },
        { name: 'Traditional Family Ceremony Cooking', slug: 'family-ceremony-cooking' },
      ],
    },
    {
      name: 'Party Arrangement',
      slug: 'party-arrangement',
      description: 'High-energy private celebrations, corporate galas, anniversary soirees, lighting effects, and bespoke bar setups.',
      sortOrder: 4,
      subcategories: [
        { name: 'Event Coordination & Floor Management', slug: 'event-coordination' },
        { name: 'Craft Cocktail & Mocktail Bar', slug: 'cocktail-mocktail-bar' },
        { name: 'Sound Systems & Intelligent Stage Lighting', slug: 'party-sound-lighting' },
        { name: 'Party Photo Booths & 360 Video', slug: 'photo-booths-360' },
      ],
    },
    {
      name: 'Traditional Services',
      slug: 'traditional-services',
      description: 'Heritage cultural rituals, folk musicians, traditional attires, ancestral ceremonial coordinators, and sacred setup.',
      sortOrder: 5,
      subcategories: [
        { name: 'Cultural Ritual Coordination', slug: 'cultural-rituals' },
        { name: 'Traditional Live Instrumentalists & Folk Music', slug: 'traditional-folk-music' },
        { name: 'Turban & Saree Ceremonial Draping', slug: 'traditional-attire-draping' },
        { name: 'Ancestral Blessing & Pithi / Haldi Ceremony', slug: 'haldi-pithi-ceremony' },
      ],
    },
    {
      name: 'Others',
      slug: 'others',
      description: 'VIP concierge, luxury chauffeur, drone cinematic displays, custom keepsake gifts, and specialized ceremonial requests.',
      sortOrder: 6,
      subcategories: [
        { name: 'VIP Concierge & Guest Transportation', slug: 'vip-concierge' },
        { name: 'Drone Videography & Light Shows', slug: 'drone-aerial' },
        { name: 'Custom Invitations & Luxury Favors', slug: 'invitations-favors' },
      ],
    },
  ];

  const createdCategories: Record<string, { id: string; subMap: Record<string, string> }> = {};

  for (const catDef of categoryDefs) {
    const cat = await prisma.category.create({
      data: {
        name: catDef.name,
        slug: catDef.slug,
        description: catDef.description,
        sortOrder: catDef.sortOrder,
        order: catDef.sortOrder,
      },
    });

    const subMap: Record<string, string> = {};
    for (let i = 0; i < catDef.subcategories.length; i++) {
      const sub = catDef.subcategories[i];
      const createdSub = await prisma.subCategory.create({
        data: {
          name: sub.name,
          slug: sub.slug,
          categoryId: cat.id,
          sortOrder: i + 1,
        },
      });
      subMap[sub.slug] = createdSub.id;
    }

    createdCategories[catDef.slug] = { id: cat.id, subMap };
  }

  console.log('✅ Created 6 requested Categories & all Subcategories.');

  // Step 5: Fetch vendors to assign gigs
  const vendors = await prisma.vendorProfile.findMany({
    select: { id: true, businessName: true },
  });

  if (vendors.length === 0) {
    throw new Error('No vendors found to assign services to. Please ensure vendor profiles exist.');
  }

  // Link all vendors to all categories in vendor_categories
  for (const v of vendors) {
    for (const catKey of Object.keys(createdCategories)) {
      await prisma.vendorCategory.upsert({
        where: {
          vendorProfileId_categoryId: {
            vendorProfileId: v.id,
            categoryId: createdCategories[catKey].id,
          },
        },
        update: {},
        create: {
          vendorProfileId: v.id,
          categoryId: createdCategories[catKey].id,
        },
      });
    }
  }

  // Helper to pick a vendor
  const getVendor = (preferredNameFragment?: string) => {
    if (preferredNameFragment) {
      const match = vendors.find((v) =>
        v.businessName.toLowerCase().includes(preferredNameFragment.toLowerCase()),
      );
      if (match) return match.id;
    }
    return vendors[Math.floor(Math.random() * vendors.length)].id;
  };

  // Step 6: Define Services (Gigs)
  // We prioritize Bridal (10), Birthday (10), and Cooking for Ceremonies (10), followed by Party (4), Traditional (4), Others (3)
  console.log('✨ Generating 41 high-touch, realistic services with full packages & gallery...');

  const gigsData = [
    // ----------------------------------------------------
    // 1. BRIDAL CEREMONY (10 services)
    // ----------------------------------------------------
    {
      category: 'bridal-ceremony',
      subcategory: 'bridal-makeup',
      vendor: 'bloom',
      title: 'Royal Bridal Glow: Luxury Airbrush Makeup & Couture Hair Styling',
      slug: 'royal-bridal-glow-luxury-airbrush-makeup',
      description: `### Premium Couture Bridal Artistry
Celebrate your wedding day with immaculate, high-definition airbrush bridal makeup and royal hair styling. Every bride receives a personalized skin-prep ritual, luxury false mink lashes, veil setting, and jewelry placement.

- **Trial Session Included** with digital face-charting
- **Long-wearing 18-hour waterproof formula**
- **Touch-up concierge kit** provided for the evening reception
- **Complimentary bridesmaid touch-ups** included in higher tiers

*All milestone payments are safely locked in Ophir Escrow until you inspect and approve your bridal look.*`,
      tags: ['bridal makeup', 'wedding makeup', 'hair styling', 'airbrush', 'luxury bride'],
      images: [
        'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1545232979-fbf6c6156e79?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Bridal Ceremony Essential',
          description: 'Single-event bridal makeup and hair styling with premium lashes and dupatta/veil placement.',
          price: 650,
          hours: '3 Hours On-site',
          turnaround: 'Same day',
          isPopular: false,
          features: ['HD Airbrush Makeup', 'Couture Hair Styling', 'Lashes & Dupatta Draping', 'Touch-up Powder Kit'],
        },
        {
          title: 'Royal Two-Event Bridal Suite',
          description: 'Full bridal makeup and hair styling for both ceremony and evening reception, with pre-wedding trial.',
          price: 1250,
          hours: '8 Hours Coverage',
          turnaround: 'Full Day',
          isPopular: true,
          features: ['Complete Makeup & Hair Trial', 'Ceremony + Reception Looks', 'Mother-of-the-Bride Makeup', 'On-site Touch-up Artist'],
        },
        {
          title: 'Imperial Bridal Concierge',
          description: '3-day complete wedding coverage (Mehendi, Sangeet, Ceremony, Reception) with personal artist companion.',
          price: 2800,
          hours: '3 Days On-site',
          turnaround: 'Multi-day',
          isPopular: false,
          features: ['Multi-day Event Coverage', 'Bride + 4 Bridal Party Members', 'Luxury Skincare Pre-prep', 'Emergency Bridal Valet'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'bridal-photography',
      vendor: 'luminary',
      title: 'Cinematic Royal Wedding: 4K Drone, Documentary & Fine-Art Bridal Cinema',
      slug: 'cinematic-royal-wedding-4k-drone-bridal-cinema',
      description: `### Award-Winning Bridal Cinema & Fine-Art Photography
Capture the emotional depth, architectural splendor, and joyous celebration of your bridal ceremony. We blend unobtrusive documentary storytelling with timeless editorial portraits.

- **Dual master cinematographers + 4K aerial drone**
- **Full-feature 45-minute ceremony film + 4-minute teaser trailer**
- **Over 800+ color-graded high-resolution photos** delivered in an online luxury gallery
- **Physical hand-crafted Italian leather photo album**`,
      tags: ['bridal photography', 'wedding video', 'drone cinematography', 'fine art', 'bridal portraits'],
      images: [
        'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Ceremony Highlight',
          description: '6 hours of dedicated single-shooter cinematic capture and 300+ edited photographs.',
          price: 1500,
          hours: '6 Hours',
          turnaround: '14 Days',
          isPopular: false,
          features: ['6 Hours Photo & Video', '300 High-Res Photos', '3-min 4K Cinematic Highlight', 'Online Cloud Gallery'],
        },
        {
          title: 'Signature Bridal Masterpiece',
          description: 'Full 10-hour dual-cinematographer and lead photographer coverage with 4K drone cinematography.',
          price: 2900,
          hours: '10 Hours',
          turnaround: '21 Days',
          isPopular: true,
          features: ['Dual Cinematographers + Lead Photographer', '4K Drone Aerial Footage', 'Full Ceremony & Speeches Edit', 'Leather-bound Hardcover Album'],
        },
        {
          title: 'Imperial Weekend Heirloom',
          description: 'Comprehensive multi-event wedding coverage from rehearsal dinner to ceremony and grand farewell.',
          price: 5200,
          hours: 'Full Weekend',
          turnaround: '30 Days',
          isPopular: false,
          features: ['3 Days Comprehensive Coverage', 'Raw 4K Video Archive', '2 Parent Albums + 1 Heirloom Album', 'Next-Day Social Media Teaser'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'bridal-stage-decor',
      vendor: 'bloom',
      title: 'Grand Floral Mandap & Bridal Stage Canopy Architecture',
      slug: 'grand-floral-mandap-bridal-stage-canopy',
      description: `### Majestic Floral Installations for Wedding Ceremonies
Transform your ceremony venue into an ethereal wonderland with suspended floral chandeliers, cascading white hydrangeas, fresh Ecuadorian roses, and bespoke golden architectural arches.

- **Custom 3D CAD visualization before installation**
- **Premium fresh-cut seasonal imported florals**
- **Integrated stage uplighting, ambient dimming & floral aisle runners**
- **Turnkey setup and late-night breakdown included**`,
      tags: ['bridal stage', 'floral mandap', 'wedding flowers', 'stage decor', 'luxury florals'],
      images: [
        'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Classic Floral Arch & Backdrop',
          description: 'Elegant semi-circular fresh floral arch, drape backdrop, and 6 floral aisle pedestals.',
          price: 1800,
          hours: 'Full Day Setup',
          turnaround: 'Day of Event',
          isPopular: false,
          features: ['Fresh Rose & Hydrangea Arch', 'Luxury Velvet Backdrop', '6 Aisle Pillars', 'Stage Spotlighting'],
        },
        {
          title: 'Majestic Royal Mandap / Stage',
          description: '4-pillar grand floral canopy with suspended ceiling blooms, elevated stage riser, and candlelit runway.',
          price: 3600,
          hours: 'Full Day Setup',
          turnaround: 'Day of Event',
          isPopular: true,
          features: ['4-Pillar Floral Canopy', 'Suspended Flower Ceiling', 'Candlelit Mirror Runway', 'Complete White Carpet Riser'],
        },
        {
          title: 'Palatial Ballroom Transformation',
          description: 'Complete ceremony transformation with 360-degree floral stage, grand entrance archway, and 20 guest centerpieces.',
          price: 7500,
          hours: 'Full Weekend Setup',
          turnaround: 'Day of Event',
          isPopular: false,
          features: ['Custom Architectural Stage', '20 Grand Table Centerpieces', 'Entrance Tunnel of Flowers', 'Full Teardown & Removal'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'henna-mehndi',
      vendor: 'bloom',
      title: 'Master Bridal Henna Artistry: Traditional Organic Rajasthani & Arabic Mehndi',
      slug: 'master-bridal-henna-artistry-organic-mehndi',
      description: `### Artisanal 100% Organic Bridal Henna
Intricate, deeply pigmented, 100% natural organic henna crafted from freshly ground Rajasthani Lawsonia inermis with pure eucalyptus and lavender essential oils. 

- **Guaranteed rich mahogany/burgundy stain within 48 hours**
- **Custom motif design: bride & groom portraits, sacred verses, skyline silhouettes**
- **Aftercare sealant spray & herbal organic balm included**`,
      tags: ['bridal henna', 'mehndi artist', 'wedding henna', 'organic mehndi', 'traditional'],
      images: [
        'https://images.unsplash.com/photo-1582879304171-8041c73b0368?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Classic Bridal Hands & Feet',
          description: 'Delicate traditional motifs to elbows on palms and tops of hands, with ankle cuffs on feet.',
          price: 350,
          hours: '4 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Elbow-length Palm & Top Henna', 'Ankle-height Foot Henna', 'Organic Essential Oil Mix', 'Herbal Balm Sealant'],
        },
        {
          title: 'Royal Bridal Full Coverage',
          description: 'Dense, intricate royal story motifs to elbows, mid-calf on feet, plus complimentary henna for 4 family members.',
          price: 650,
          hours: '6 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Dense Custom Storyline Motifs', 'Mid-calf Foot Coverage', 'Bride & Groom Portrait Accents', 'Henna for 4 VIP Guests'],
        },
        {
          title: 'Imperial Mehndi Celebration Party',
          description: 'Full bridal coverage plus assistant henna artist providing rapid designs for up to 25 wedding party guests.',
          price: 1100,
          hours: '8 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Master Bridal Artwork', 'Assistant Artist for 25 Guests', 'Party Henna Station Setup', 'Luxury Organic Goody Bags'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'complete-bridal-planning',
      vendor: 'luminary',
      title: 'White-Glove Bridal Concierge & Full-Scope Wedding Ceremony Management',
      slug: 'white-glove-bridal-concierge-wedding-management',
      description: `### Flawless Luxury Wedding Coordination
Leave every single logistical headache to certified master event directors. From contract arbitration and vendor scheduling to rehearsal orchestration and guest concierge, we guarantee effortless perfection on your wedding day.`,
      tags: ['bridal planning', 'wedding planner', 'day-of coordinator', 'luxury wedding', 'full concierge'],
      images: [
        'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Month-of & Day-of Coordination',
          description: 'Complete timeline creation, vendor check-ins 30 days prior, rehearsal lead, and 12-hour day-of coordination.',
          price: 1800,
          hours: '30 Days + Event Day',
          turnaround: 'Full Event',
          isPopular: false,
          features: ['Minute-by-Minute Timeline', 'Vendor Management & Briefing', '12 Hours Day-of Directing', 'Emergency Bridal Kit'],
        },
        {
          title: 'Full Bridal Orchestration',
          description: 'Full wedding planning from vendor selection, budget management, aesthetic curation, to wedding day direction.',
          price: 3900,
          hours: '6 Months Full Service',
          turnaround: 'Full Event',
          isPopular: true,
          features: ['Full Vendor Negotiation', 'Budget Tracking & Allocation', 'Design Concept & Floorplans', '2 Lead Coordinators On-site'],
        },
        {
          title: 'Luxury Imperial Bridal Suite',
          description: 'Unlimited planning, VIP guest airport concierge, rehearsal dinner, ceremony, and post-wedding brunch execution.',
          price: 7800,
          hours: 'Full Year Service',
          turnaround: 'Multi-day Event',
          isPopular: false,
          features: ['Multi-Day Event Execution', 'VIP Guest Concierge Service', '4 Coordinators On-site', '24/7 Dedicated Bridal Hotline'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'bridal-stage-decor',
      vendor: 'bloom',
      title: 'Romantic Candlelit Ceremony Aisle & Glass Platform Riser Design',
      slug: 'romantic-candlelit-ceremony-aisle-glass-platform',
      description: `Create an enchanting walk down the aisle with 200+ floating cylinder candles, mirrored reflective walkways, rose-petal carpets, and delicate botanical pedestals.`,
      tags: ['ceremony aisle', 'candlelit wedding', 'glass runway', 'bridal walkway'],
      images: ['https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Petal & Pillar Candle Aisle',
          description: 'Rose petal carpet with 100 glowing hurricane pillar candles along 50ft of aisle.',
          price: 950,
          hours: '4 Hours Setup',
          turnaround: 'Day of Event',
          isPopular: false,
          features: ['100 Glass Pillar Candles', 'Fresh Rose Petal Blanket', 'Entrance Urns & Florals', 'Complete Teardown'],
        },
        {
          title: 'Mirrored Crystal Runway',
          description: '60ft gleaming mirrored aisle with floating floral vases, low-lying fog effect, and 150 candles.',
          price: 2100,
          hours: '6 Hours Setup',
          turnaround: 'Day of Event',
          isPopular: true,
          features: ['60ft Mirror Runway Floor', '150 Floating Candles', 'Dry-Ice Low Fog for Bridal Walk', 'Floral Pew Markers'],
        },
        {
          title: 'Glass Over Water / Elevated Stage Walkway',
          description: 'Reinforced transparent glass elevated runway with submerged underwater spotlights and floral perimeter.',
          price: 4500,
          hours: 'Full Day Setup',
          turnaround: 'Day of Event',
          isPopular: false,
          features: ['Structural Glass Runway', 'Underwater Color-matched Lighting', 'Perimeter White Orchid Garlands', 'Structural Safety Certified'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'bridal-photography',
      vendor: 'luminary',
      title: 'Editorial Bridal Portraiture & Pre-Wedding Love Story Shoot',
      slug: 'editorial-bridal-portraiture-pre-wedding-shoot',
      description: `Fine-art editorial portraits captured in romantic architectural locations or private botanical gardens prior to the wedding frenzy.`,
      tags: ['pre-wedding shoot', 'bridal portrait', 'editorial wedding', 'love story'],
      images: ['https://images.unsplash.com/photo-1545232979-fbf6c6156e79?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Golden Hour Portrait Session',
          description: '2-hour scenic sunset session with 50 masterfully edited digital portraits.',
          price: 600,
          hours: '2 Hours',
          turnaround: '7 Days',
          isPopular: false,
          features: ['2 Location Outfits', '50 Retouched Photos', 'Online Gallery', 'Print Rights'],
        },
        {
          title: 'Cinematic Story & Editorial Album',
          description: '4-hour session across multiple locations with hair/makeup artist on set and 100 retouched images.',
          price: 1300,
          hours: '4 Hours',
          turnaround: '10 Days',
          isPopular: true,
          features: ['Hair/Makeup Artist on Set', '100 Master Retouched Images', '1-min Cinematic Reel', 'Linen Keepsake Album'],
        },
        {
          title: 'Destination Romantic Odyssey',
          description: 'Full-day destination shoot in historic estates or scenic coastal bluffs with styled editorial sets.',
          price: 2600,
          hours: '8 Hours',
          turnaround: '14 Days',
          isPopular: false,
          features: ['Full-Day Destination Travel', '200 Retouched Photographs', '3-min 4K Love Story Video', 'Large Canvas Wall Art Print'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'bridal-makeup',
      vendor: 'bloom',
      title: 'South Asian Bridal Suite: Sabyasachi & Royal Mughal Styling Perfection',
      slug: 'south-asian-bridal-suite-sabyasachi-mughal-styling',
      description: `Specialized cultural bridal styling: heavy jewelry anchoring, can-can skirt volume adjustment, traditional bindi art, and regal matte complexion.`,
      tags: ['desi bride', 'mughal styling', 'jewellery setting', 'cultural bride'],
      images: ['https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Ceremony Sabyasachi Style',
          description: 'Bridal makeup, traditional hairstyle with real jasmine flowers, jewelry pinning, and double dupatta draping.',
          price: 750,
          hours: '4 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Double Dupatta Draping', 'Heavy Matha Patti Pinning', 'Fresh Jasmine / Gajra Styling', 'Waterproof Sweat-resistant Base'],
        },
        {
          title: 'Two-Day Wedding Festivity Suite',
          description: 'Vibrant Haldi/Mehendi soft-dewy look + Grand Wedding Day regal Mughal transformation.',
          price: 1400,
          hours: '2 Days Coverage',
          turnaround: 'Multi-day',
          isPopular: false,
          features: ['Haldi Fresh Floral Look', 'Grand Ceremony Royal Look', '2 Bridal Party Members Included', 'Luxury Skin Prep Kit'],
        },
        {
          title: 'Royal Mughal Bridal Entourage',
          description: 'Bride + 5 Family VIPs fully styled for wedding ceremony and reception with on-site standby artist.',
          price: 2900,
          hours: 'Full Day Standby',
          turnaround: 'Multi-day',
          isPopular: false,
          features: ['Bride + 5 VIPs Styled', 'Full Day On-site Standby', 'Touch-ups for Photoshoots', 'Jewelry & Wardrobe Concierge'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'bridal-stage-decor',
      vendor: 'bloom',
      title: 'Intimate Bohemian Garden Ceremony Arch & Pampas Grass Aesthetic',
      slug: 'intimate-bohemian-garden-ceremony-arch',
      description: `For modern, bohemian, and rustic bridal ceremonies: bleached Italian ruscus, pampas plumes, terracotta urns, and organic neutral floral textures.`,
      tags: ['boho wedding', 'pampas grass', 'garden ceremony', 'rustic bridal'],
      images: ['https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Boho Triangle / Hexagon Arch',
          description: 'Bespoke wooden triangular arch accented with fluffy pampas grass, white dried palms, and terracotta florals.',
          price: 850,
          hours: '3 Hours Setup',
          turnaround: 'Day of Event',
          isPopular: true,
          features: ['Geometric Wooden Arch', 'Pampas & Palm Foliage', 'Aisle Rugs & Lanterns', 'Setup & Breakdown'],
        },
        {
          title: 'Enchanted Boho Meadow Stage',
          description: 'Ground-growing floral meadow creating a crescent ring around the bride and groom with vintage Persian rugs.',
          price: 1750,
          hours: '5 Hours Setup',
          turnaround: 'Day of Event',
          isPopular: false,
          features: ['Circular Ground Meadow Ring', 'Vintage Moroccan & Persian Rugs', 'Terracotta Ceramic Urns', '6 Floral Aisle Clusters'],
        },
        {
          title: 'Complete Garden Estate Boho Suite',
          description: 'Full ceremony arch, 80 guest chair floral ties, welcome sign easel, and cocktail transition decor.',
          price: 3400,
          hours: 'Full Day Setup',
          turnaround: 'Day of Event',
          isPopular: false,
          features: ['Grand Boho Archway', '80 Chair Floral Bunches', 'Cocktail Lounge Furniture Decor', 'Custom Wooden Calligraphy Sign'],
        },
      ],
    },
    {
      category: 'bridal-ceremony',
      subcategory: 'complete-bridal-planning',
      vendor: 'luminary',
      title: 'Bridal Rehearsal Dinner & Ceremony Master of Ceremonies (MC / Host)',
      slug: 'bridal-rehearsal-dinner-ceremony-mc-host',
      description: `Charismatic, multilingual master of ceremonies to guide your bridal party through emotional toasts, rehearsal protocol, and ceremony cues.`,
      tags: ['wedding mc', 'ceremony host', 'rehearsal dinner', 'bilingual host'],
      images: ['https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Rehearsal Evening Host',
          description: '3 hours leading the wedding party walkthrough and hosting dinner toasts with warmth and humor.',
          price: 500,
          hours: '3 Hours',
          turnaround: 'Evening of Event',
          isPopular: false,
          features: ['Rehearsal Walkthrough Direction', 'Dinner Speech Coordination', 'Wireless Mic Included', 'Bilingual Support'],
        },
        {
          title: 'Full Ceremony & Reception MC',
          description: 'Lead wedding host for solemn ceremony announcements, grand bridal entrance, cake cutting, and program flow.',
          price: 1100,
          hours: '8 Hours',
          turnaround: 'Full Day',
          isPopular: true,
          features: ['Ceremony Program Flow', 'Grand Reception Entrances', 'Vendor Coordination Cues', 'Interactive Guest Engagement'],
        },
        {
          title: 'Weekend Wedding Master Host',
          description: 'Comprehensive host covering welcome party, Sangeet/Rehearsal, ceremony announcements, and after-party.',
          price: 2200,
          hours: '3 Days',
          turnaround: 'Multi-day',
          isPopular: false,
          features: ['Welcome Party Hosting', 'Ceremony Protocols', 'Grand Gala Hosting', 'Audience Entertainment Games'],
        },
      ],
    },

    // ----------------------------------------------------
    // 2. BIRTHDAY PARTY ARRANGEMENT (10 services)
    // ----------------------------------------------------
    {
      category: 'birthday-party',
      subcategory: 'birthday-decor',
      vendor: 'bloom',
      title: 'Luxury Themed Birthday Balloon & Floral Arch Architecture',
      slug: 'luxury-themed-birthday-balloon-floral-arch',
      description: `### High-End Milestone Birthday Transformations
Elevate any milestone birthday (1st, 16th, 18th, 21st, 30th, 50th) with custom double-stuffed pastel balloon garlands, oversized marquee numbers, custom laser-cut acrylic backdrops, and fresh floral touches.

- **Non-toxic, biodegradable premium organic latex**
- **4-ft illuminated LED marquee numbers**
- **Personalized vinyl name branding**`,
      tags: ['birthday decor', 'balloon arch', 'milestone birthday', 'marquee numbers', 'party backdrop'],
      images: [
        'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Chic Milestone Backdrop',
          description: '10ft organic double-stuffed balloon garland with round acrylic backdrop and vinyl personalized name.',
          price: 450,
          hours: '2 Hours Setup',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['10ft Organic Balloon Garland', 'Round Ripple Backdrop', 'Custom Vinyl Name', 'Tear-down Service'],
        },
        {
          title: 'Signature Royal Celebration Arch',
          description: '20ft multi-tiered organic balloon installation, two 4-ft LED marquee numbers, and 3 cylindrical pedestals.',
          price: 950,
          hours: '3 Hours Setup',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['20ft Balloon Artistry', 'Two 4-ft LED Marquee Numbers', '3 Cake Pedestals', 'Fresh Flower Accents'],
        },
        {
          title: 'Grand Palace Birthday Dream',
          description: 'Full immersive ballroom photo zone with custom fabricated 3D archways, mirror floor, neon signage, and balloons.',
          price: 2100,
          hours: '5 Hours Setup',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['3D Fabricated Castle/Stage', 'Custom Neon Light Signage', 'Glossy Monogrammed Floor', 'Full Room Ceiling Balloons'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-cakes',
      vendor: 'sweetdelights',
      title: 'Artisanal Multi-Tier Sculpted Milestone Birthday Cakes & Dessert Bar',
      slug: 'artisanal-multi-tier-sculpted-birthday-cake',
      description: `### Haute Pâtisserie for Unforgettable Birthdays
Custom sculpted birthday centerpieces handmade from scratch using Belgian chocolate, Madagascar Bourbon vanilla, and delicate Valrhona fruit purées.

- **Available in 1 to 4 tiers serving 25 to 200 guests**
- **Handmade sugar florals, 24k gold leaf foil, and custom toppers**
- **Allergies accommodated: Gluten-free, dairy-free, and vegan options**`,
      tags: ['birthday cake', 'custom cake', 'dessert table', 'milestone cake', 'fondant'],
      images: [
        'https://images.unsplash.com/photo-1533294455009-a77b7557d2d1?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Two-Tier Celebration Cake (Serves 30)',
          description: 'Bespoke 2-tier buttercream or fondant cake with custom acrylic cake topper and gold leaf detailing.',
          price: 280,
          hours: 'Delivery Included',
          turnaround: '3 Days Notice',
          isPopular: false,
          features: ['Serves 30 Guests', 'Choice of 2 Gourmet Flavors', '24k Gold Leaf Accents', 'Free Temperature-controlled Delivery'],
        },
        {
          title: 'Three-Tier Showstopper & 24 Macarons',
          description: '3-tier architectural cake with handmade sugar flowers, plus two dozen matching French macarons.',
          price: 580,
          hours: 'Delivery & Setup',
          turnaround: '5 Days Notice',
          isPopular: true,
          features: ['Serves 75 Guests', 'Handmade Sugar Peonies/Roses', '24 Hand-painted French Macarons', 'On-site Table Setup'],
        },
        {
          title: 'Grand Royal Dessert Table Suite',
          description: '4-tier centerpiece cake plus 100 individual dessert treats (cake pops, gourmet mousse cups, tartlets, macarons).',
          price: 1350,
          hours: 'Full Display Setup',
          turnaround: '7 Days Notice',
          isPopular: false,
          features: ['4-Tier Grand Cake (150 Servings)', '100 Gourmet Miniature Pastries', 'Luxury Gold Tiered Stands', 'Menu Display Cards'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-dj-sound',
      vendor: 'windycity',
      title: 'Milestone Birthday Party DJ, Intelligent Club Lighting & Fog FX',
      slug: 'milestone-birthday-party-dj-intelligent-lighting',
      description: `### High-Octane Birthday Beats & Club Vibe
Turn your birthday into an unforgettable nightlife experience with our professional open-format DJ, crystal-clear QSC audio array, computerized moving-head beam lights, and cold-spark indoor pyrotechnics.`,
      tags: ['birthday dj', 'party sound', 'moving lights', 'cold sparks', 'club lighting'],
      images: ['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Birthday Club Basics',
          description: '4 hours of non-stop curated music with 2 high-power speakers, wireless mic, and sound-activated lighting.',
          price: 500,
          hours: '4 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['4 Hours Open-Format DJ', '2 QSC Powered Speakers', 'Wireless Mic for Toasts', 'Sound-Reactive LED Lighting'],
        },
        {
          title: 'Milestone Nightclub Experience',
          description: '6 hours coverage, dual subwoofers, 4 moving-head beams on trussing, and 2 cold-spark indoor fountains.',
          price: 950,
          hours: '6 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['6 Hours Professional DJ', '18-inch Thumping Subwoofer', 'Moving-Head Intelligent Beams', '2 Cold-Spark Firework FX'],
        },
        {
          title: 'VIP Festival Birthday Rig',
          description: 'All-night DJ + MC duo, 4 cold sparks, low-lying cloud smoke, laser show, and glow baton giveaways for guests.',
          price: 1850,
          hours: '8 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['DJ + Master of Ceremonies', '4 Cold Spark FX Fountains', 'Concert-Grade Laser Show', '100 Foam LED Light Batons'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-entertainment',
      vendor: 'luminary',
      title: 'Kids & Family Magical Birthday: Illusionist, Face Painter & Character Artists',
      slug: 'kids-family-magical-birthday-illusionist-face-painter',
      description: `Create wonder for young minds with a 45-minute interactive comedy magic show, FDA-approved cosmetic face painters, and balloon twisting masters.`,
      tags: ['kids birthday', 'magician', 'face painter', 'balloon twisting', 'children party'],
      images: ['https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Magic & Balloon Wonder',
          description: '45-min comedy magic show where the birthday child stars as the assistant, plus balloon twisting for 20 kids.',
          price: 400,
          hours: '2 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['45-min Interactive Magic Show', 'Birthday Child Special Trick', 'Animal Balloon Sculptures', 'Sound System Included'],
        },
        {
          title: 'Deluxe Carnival Fun Package',
          description: 'Magic show + 1 expert face painter + balloon twisting artist keeping up to 30 kids entertained throughout.',
          price: 750,
          hours: '3 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Comedy Illusion Show', 'Cosmetic Grade Face Painting', 'Deluxe Balloon Costumes', 'Game Coordination with Prizes'],
        },
        {
          title: 'Ultimate Theme Character Adventure',
          description: '2 costumed characters (superhero / princess), magic performance, cotton candy cart, and bubble cannon finale.',
          price: 1350,
          hours: '4 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['2 Authentic Costumed Characters', 'Cotton Candy Machine & Chef', 'High-Output Bubble Cannon', 'Kids Dance Party Jam'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-planning',
      vendor: 'luminary',
      title: 'Full-Service Curated Milestone Birthday Party Producer',
      slug: 'full-service-milestone-birthday-party-producer',
      description: `From venue sourcing and caterer coordination to timeline creation and surprise party secrecy, our lead event producer handles everything seamlessly.`,
      tags: ['birthday planner', 'surprise party', 'event producer', 'milestone event'],
      images: ['https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Day-of Birthday Facilitator',
          description: '5 hours of on-site coordination ensuring catering, cake arrival, DJ timing, and surprise entries run like clockwork.',
          price: 450,
          hours: '5 Hours',
          turnaround: 'Day of Event',
          isPopular: false,
          features: ['Vendor Delivery Management', 'Timeline Execution', 'Guest Greeting & Direction', 'Emergency Host Kit'],
        },
        {
          title: 'Full Birthday Concept & Execution',
          description: 'End-to-end event planning: theme design, vendor contract negotiations, personalized party favors, and day-of management.',
          price: 1200,
          hours: '1 Month Prep + Event',
          turnaround: 'Day of Event',
          isPopular: true,
          features: ['Theme Concept & Moodboards', 'Vendor Sourcing & Contracts', 'Custom Favors & Signage', '8 Hours Day-of Directing'],
        },
        {
          title: 'VIP Luxury Secret Soirée',
          description: 'Comprehensive planning for high-profile or large surprise birthday celebrations with security, valet, and photography.',
          price: 2600,
          hours: '2 Months Prep + Event',
          turnaround: 'Full Event',
          isPopular: false,
          features: ['Surprise Protocol Execution', 'Valet & Security Liaison', 'Full Multi-vendor Management', 'Post-Party Cleanup Team'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-decor',
      vendor: 'bloom',
      title: 'First Birthday "Wild One" / "One-derland" Safari Fairytale Setup',
      slug: 'first-birthday-safari-fairytale-setup',
      description: `Bespoke 1st birthday fairytale themes featuring giant plush giraffes, custom wooden baby name blocks, pastel jungle arches, and high-chair floral crowns.`,
      tags: ['1st birthday', 'wild one', 'smash cake decor', 'baby birthday'],
      images: ['https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'High-Chair & Photo Corner',
          description: 'Decorated high-chair, mini organic balloon garland, and personalized photo backdrop for cake smash.',
          price: 350,
          hours: '2 Hours Setup',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['High-chair Garland & Tassels', '8ft Photo Balloon Garland', 'Custom First Year Milestone Board', 'Cake Smash Floor Mat'],
        },
        {
          title: 'Enchanted Safari Playland',
          description: '16ft archway, 2 life-size plush safari animals, custom wooden name cubes, and mini ball pit with white balls.',
          price: 850,
          hours: '3 Hours Setup',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['16ft Multi-tone Balloons', 'Life-size Safari Animals', 'Soft-play White Ball Pit', 'Custom Cut-out Wooden Name'],
        },
        {
          title: 'Full Kingdom 1st Birthday World',
          description: 'Ballroom transformation with custom castle walls, ball pit, slide, photo booth, and dessert pedestals.',
          price: 1800,
          hours: '4 Hours Setup',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Custom Fabricated Castle Walls', 'Full Luxury Soft-Play Zone', 'Dessert Table Architecture', 'Complete Teardown Included'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-cakes',
      vendor: 'sweetdelights',
      title: 'Custom Character & Theme 3D Sculpted Birthday Cakes',
      slug: 'custom-character-3d-sculpted-birthday-cakes',
      description: `Showcase your child or spouse's favorite passion with gravity-defying sculpted 3D cakes: vintage sports cars, magical castles, animated heroes, or guitars.`,
      tags: ['3d cake', 'sculpted cake', 'character cake', 'kids cake'],
      images: ['https://images.unsplash.com/photo-1533294455009-a77b7557d2d1?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Sculpted 3D Single Figure',
          description: 'Detailed 3D modeled edible fondant figure on a delicious gourmet 10-inch layered cake (serves 25).',
          price: 320,
          hours: 'Delivery Included',
          turnaround: '4 Days Notice',
          isPopular: true,
          features: ['Hand-sculpted Sugar Figure', 'Serves 25 Guests', 'Custom Name Inscription', 'Internal Support Armature'],
        },
        {
          title: 'Full Gravity-Defying Vehicle/Castle',
          description: 'Entire cake sculpted into a 3D structural model with internal armature, edible airbrushing, and LED light features.',
          price: 680,
          hours: 'Delivery & Setup',
          turnaround: '7 Days Notice',
          isPopular: false,
          features: ['Full 3D Structural Cake', 'Serves 50 Guests', 'Edible Airbrush Detailing', 'LED Lighting Integration'],
        },
        {
          title: 'Masterpiece 3D Museum Centerpiece',
          description: 'Massive scale 3D sculpture serving 100+ guests with interactive dry-ice smoke or moving elements.',
          price: 1450,
          hours: 'Chef Hand Delivery',
          turnaround: '10 Days Notice',
          isPopular: false,
          features: ['Serves 100+ Guests', 'Interactive Smoke / Motion FX', 'Head Chef On-site Assembly', 'Custom Display Pedestal'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-dj-sound',
      vendor: 'velvetpour',
      title: 'Illuminated LED Glow Furniture & Cocktail Lounge for Birthdays',
      slug: 'illuminated-led-glow-furniture-cocktail-lounge',
      description: `Transform backyards or venues into chic glowing VIP lounges with wireless LED light-up cocktail tables, curved sectional sofas, and glowing ice buckets.`,
      tags: ['glow furniture', 'led lounge', 'vip birthday', 'party rental'],
      images: ['https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Glow High-Boy Cocktail Set',
          description: '4 wireless color-changing LED high-top cocktail tables and 8 matching white acrylic barstools.',
          price: 400,
          hours: 'Full Event Rental',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['4 Color-Changing LED Tables', '8 Acrylic Barstools', '16-Color Remote Control', '12-hour Battery Life'],
        },
        {
          title: 'VIP Glowing Modular Lounge',
          description: 'Semi-circular LED curved sectional sofa, glowing coffee table, 4 high-boys, and LED champagne chillers.',
          price: 950,
          hours: 'Full Event Rental',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Curved LED Sectional Sofa', 'Glowing Center Coffee Table', '4 LED High-Boys + Stools', '2 LED Ice Buckets'],
        },
        {
          title: 'Mega Birthday Nightclub Lounge',
          description: 'Full nightclub package: 8 high-boys, 2 curved VIP sofa pits, 1 glowing curved bar counter, and dance floor perimeter cubes.',
          price: 1900,
          hours: 'Full Event Rental',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Full 8ft Glowing Bar Counter', '2 Large VIP Sofa Pits', '8 High-Boy Tables & Stools', 'Setup & Late-Night Removal'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-entertainment',
      vendor: 'luminary',
      title: 'Celebrity Lookalike & Live Tribute Performance for Milestone Birthdays',
      slug: 'celebrity-lookalike-live-tribute-performance',
      description: `Surprise the birthday guest of honor with high-energy tribute acts: Rat Pack crooners, Motown sensations, or 80s rock tributes.`,
      tags: ['live performance', 'tribute singer', 'milestone surprise', 'entertainment'],
      images: ['https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Surprise 30-min Tribute Set',
          description: 'Grand entrance and 30-minute explosive live singing performance dedicated to the birthday honoree.',
          price: 550,
          hours: '1 Hour On-site',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['30-min Live Singing Performance', 'Personalized Birthday Serenade', 'Photo Session with Guests', 'High-quality Backing Tracks'],
        },
        {
          title: 'Full 90-min Concert Show',
          description: 'Two 45-minute live sets with costume change, backup dancers, and audience sing-along engagement.',
          price: 1100,
          hours: '2.5 Hours On-site',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['90 Minutes Live Concert', 'Costume Changes', 'Dancer Duo Accompaniment', 'Professional Audio Tech'],
        },
        {
          title: 'The Legend All-Star Spectacular',
          description: 'Full 5-piece live tribute band with brass section and custom rehearsed family favorite songs.',
          price: 2400,
          hours: '4 Hours Coverage',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['5-Piece Live Tribute Band', 'Custom Song Rehearsals', 'Wireless Audio System', 'Full Stage Interaction'],
        },
      ],
    },
    {
      category: 'birthday-party',
      subcategory: 'birthday-decor',
      vendor: 'bloom',
      title: 'Neon Glow-in-the-Dark Teen & 21st Birthday Blacklight Setup',
      slug: 'neon-glow-teen-21st-birthday-blacklight',
      description: `High-wattage UV blacklight floodlights, neon fluorescent balloon columns, glow body paint stations, and custom glowing neon signs.`,
      tags: ['neon party', 'glow party', '21st birthday', 'uv lights', 'teen party'],
      images: ['https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Blacklight Glow Room',
          description: '4 high-output 100W UV LED floodlights, 12ft neon balloon garland, and neon banner.',
          price: 380,
          hours: '3 Hours Rental',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['4 High-Power UV Floodlights', 'UV-Reactive Balloons', 'Glowing Birthday Banner', 'Setup & Pack-down'],
        },
        {
          title: 'Full Neon Rave Experience',
          description: 'Complete room blacklight immersion, custom illuminated neon text sign, and 100 glow accessories.',
          price: 850,
          hours: 'Full Evening',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['8 UV Floodlights', 'Custom Rental Neon Sign', 'Neon Face Paint Bar Kit', '100 Glow Sticks & Glasses'],
        },
        {
          title: 'VIP Neon Nightclub Rave',
          description: 'UV lights, laser beams, neon furniture, DJ stage neon wrap, and airbrush tattoo artist.',
          price: 1750,
          hours: 'Full Evening',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Complete Club Blacklight Rig', 'UV Airbrush Tattoo Artist', '4 Glowing High-Boys', 'Synchronized Strobe & Lasers'],
        },
      ],
    },

    // ----------------------------------------------------
    // 3. COOKING FOR CEREMONIES (10 services)
    // ----------------------------------------------------
    {
      category: 'cooking-ceremonies',
      subcategory: 'royal-biryani-feast',
      vendor: 'epicurean',
      title: 'Grand Royal Dum Biryani & Ceremonial Degchi Banquet Feast',
      slug: 'grand-royal-dum-biryani-ceremonial-degchi-feast',
      description: `### Authentic Heritage Mughlai & Hyderabadi Ceremonial Cooking
Prepared live in giant hand-beaten copper degchis sealed with dough. Using aged long-grain basmati, saffron infused in warm whole milk, tender halal meat cuts, and secret spice blends passed down through generations.

- **Cooked on-site over traditional slow charcoal embers (Dum)**
- **Accompanied by royal mirchi ka salan, smoked burani raita, and shahi tukda**
- **Full ceremonial brass serving staff with warm silver chafing vessels**`,
      tags: ['ceremonial cooking', 'dum biryani', 'wedding banquet', 'royal feast', 'halal catering'],
      images: [
        'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: '50-Guest Royal Degchi Feast',
          description: 'One large copper degchi of Dum Biryani (Chicken or Mutton) with saffron rice, salan, raita, and salad.',
          price: 950,
          hours: '4 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Serves up to 50 Guests', 'Authentic Copper Degchi', 'Mirchi Ka Salan & Mint Raita', '2 Service Attendants'],
        },
        {
          title: '150-Guest Grand Wedding Banquet',
          description: 'Three large copper degchis (Choice of Goat & Chicken), appetizers, roomali rotis, and Shahi Tukda dessert.',
          price: 2450,
          hours: '5 Hours Service',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Serves 150 Guests', 'Appetizers: Seekh Kebabs', 'Dum Biryani + Roomali Rotis', 'Shahi Tukda Royal Dessert', '5 Uniformed Waitstaff'],
        },
        {
          title: '300-Guest Imperial Palace Feast',
          description: 'Grand ceremony multi-course banquet: live kebabs, 6 degchis of biryani, slow-cooked dal makhani, and dessert buffet.',
          price: 4800,
          hours: '6 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Serves 300 Guests', 'Live Tandoor Kebab Station', 'Mutton & Chicken Biryani', 'Kheer & Gulab Jamun Station', 'Full Buffet Setup & Staff'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'live-banquet-stations',
      vendor: 'epicurean',
      title: 'Live Tandoori & Teppanyaki Interactive Ceremonial Fire Cooking',
      slug: 'live-tandoori-teppanyaki-fire-cooking',
      description: `### Mesmerizing Live Culinary Theatre
Captivate wedding guests with master grill-masters operating authentic clay tandoors and flaming steel planchas live in view. Fresh naan breads slapped against clay walls, sizzling lamb chops, and tiger prawns cooked to order.`,
      tags: ['live cooking', 'tandoor station', 'interactive catering', 'bbq catering', 'wedding food'],
      images: [
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Live Tandoor Bread & Kebab Bar',
          description: 'Live clay oven with master chef serving piping hot garlic naans, paneer tikka, and chicken boti for 75 guests.',
          price: 1100,
          hours: '3 Hours Live Cooking',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Authentic Clay Oven On-site', 'Fresh Naan Breads Made to Order', 'Chicken Tikka & Paneer Tikka', '2 Specialized Chefs'],
        },
        {
          title: 'Grand Fire & Sizzle Plancha Feast',
          description: 'Dual live stations: Tandoor breads & kebabs + sizzling plancha steaks, tiger prawns, and spiced lamb chops for 150 guests.',
          price: 2600,
          hours: '4 Hours Live Cooking',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Dual Live Chef Stations', 'Jumbo Tiger Prawns & Lamb Chops', 'Tandoori Garlic/Cheese Naans', 'Gourmet Chutney Trio', '4 Chefs on Display'],
        },
        {
          title: 'Imperial Culinary Pavilion (250 Guests)',
          description: 'Three distinct live interactive pavilions: Charcoal Tandoor, Flaming Teppanyaki, and Street-Food Chaat Cart.',
          price: 4900,
          hours: '5 Hours Live Cooking',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['3 Interactive Chef Stations', 'Live Chaat & Pani Puri Cart', 'Prime Meat Cuts & Seafood', '6 Chefs + Dedicated Buffet Crew'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'ceremonial-desserts',
      vendor: 'sweetdelights',
      title: 'Grand Shahi Mithai & French Patisserie Ceremonial Dessert Pavilion',
      slug: 'grand-shahi-mithai-french-patisserie-dessert-pavilion',
      description: `A stunning juxtaposition of warm, handcrafted Eastern ceremonial sweets (warm saffron jalebis made live, pistachio rasmalai) alongside European mini entremets, macarons, and gold-dusted chocolate truffles.`,
      tags: ['dessert catering', 'live jalebi', 'rasmalai', 'wedding sweets', 'patisserie'],
      images: [
        'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80',
      ],
      packages: [
        {
          title: 'Warm Live Jalebi & Rabri Station',
          description: 'Live halwai artisan frying crispy spiraled jalebis soaked in saffron syrup, served alongside chilled thick rabri.',
          price: 650,
          hours: '3 Hours Live Station',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Serves up to 100 Guests', 'Live Chef Frying Stations', 'Pistachio & Saffron Rabri', 'Traditional Clay Kulhad Cups'],
        },
        {
          title: 'East-Meets-West Luxury Dessert Bar',
          description: 'Live Jalebi station + 6 varieties of ceremonial mithai (Kaju Katli, Rasmalai) + French macarons and chocolate mousse shots.',
          price: 1450,
          hours: '4 Hours Live Station',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Serves 200 Guests', 'Live Hot Dessert Station', 'Chilled Rose Rasmalai Bar', 'French Macaron Pyramid', '2 Attendants & Display Props'],
        },
        {
          title: 'Imperial Confectionery Palace',
          description: 'Full 16ft dessert pavilion with chocolate fountain, live crepe/jalebi station, warm gulab jamun, and 250 artisan gift boxes.',
          price: 2950,
          hours: '5 Hours Live Station',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['16ft Custom Tiered Pavilion', '3-Tier Flowing Chocolate Fountain', 'Live Crepe & Jalebi Chefs', '250 Custom Guest Take-home Boxes'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'artisanal-wedding-dining',
      vendor: 'epicurean',
      title: 'Plated 5-Course Silver-Service Royal Wedding Dinner',
      slug: 'plated-5-course-silver-service-royal-dinner',
      description: `Fine dining elevated to ceremonial scale. Synchronized silver cloche service where each table is presented with artistically plated courses concurrently by white-glove staff.`,
      tags: ['plated dinner', 'fine dining catering', 'silver service', '5 course wedding'],
      images: ['https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: '3-Course Plated Ceremony (50 Guests)',
          description: 'Amuse-bouche, gourmet seasonal main course (Filet Mignon or Halibut), and plated dessert with silver cloche dome service.',
          price: 3200,
          hours: '3 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['50 Guests Plated Service', 'Synchronized Dome Reveal', 'Printed Linen Menus', '1 Server per 10 Guests'],
        },
        {
          title: '5-Course Imperial Plated Dinner (100 Guests)',
          description: 'Complete 5-course gastronomic journey: Appetizer, Soup/Salad, Intermezzo Sorbet, Dual Entrée, and Grand Finale Dessert.',
          price: 6800,
          hours: '4 Hours Service',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['100 Guests 5-Course Dining', 'Dual Entrée: Beef Tenderloin & Lobster', 'Fine China & Gold Cutlery Rental', 'Head Chef Table Visits'],
        },
        {
          title: 'Palatial Banquet for 200 Guests',
          description: 'Uncompromising culinary excellence with custom tasting session, French wine pairings, and 20 dedicated waitstaff.',
          price: 13500,
          hours: '5 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['200 Guests Luxury Plated Service', 'Sommelier Wine Pairings', 'Pre-event Tasting for 4 People', '20 Silver-Service Waitstaff'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'family-ceremony-cooking',
      vendor: 'epicurean',
      title: 'Traditional Homestyle Ceremony Cooking: Haldi, Mehndi & Sangeet Meals',
      slug: 'traditional-homestyle-ceremony-cooking',
      description: `Hearty, soul-warming family meal preparations for pre-wedding and post-wedding multi-generational gatherings. Fresh puris, daal makhani, paneer lababdar, and seasonal halwas.`,
      tags: ['homestyle cooking', 'family ceremony', 'pre-wedding food', 'comfort food catering'],
      images: ['https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Home Gathering Lunch (30 Guests)',
          description: 'Fresh poori chole, paneer makhani, jeera rice, boondi raita, and hot sooji halwa.',
          price: 450,
          hours: '3 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Serves 30 Guests', 'Fresh Puffed Pooris On-site', 'Thermal Insulated Carriers', 'Disposable Eco Plates & Cutlery'],
        },
        {
          title: 'Sangeet Night Street Food Feast (75 Guests)',
          description: 'Pav bhaji bar, live dosas, kathi rolls, and mango lassi for high-energy pre-wedding music nights.',
          price: 980,
          hours: '4 Hours Service',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Live Crispy Dosa & Pav Bhaji', 'Kathi Roll Wrap Bar', 'Chilled Mango Lassi Dispenser', '2 Attendants & Chafing Racks'],
        },
        {
          title: '3-Day Complete Family Ceremony Meals (50 Guests)',
          description: 'Full food service for 3 days covering Haldi breakfast, Mehndi lunch, and Sangeet dinner buffet.',
          price: 2800,
          hours: '3 Days Full Service',
          turnaround: 'Multi-day',
          isPopular: false,
          features: ['6 Meals Over 3 Days', 'Daily Varied Menus', 'On-site Reheating & Service', 'Full Cleanup After Every Meal'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'royal-biryani-feast',
      vendor: 'epicurean',
      title: 'Kashmiri Wazwan Ceremonial 7-Dish Royal Traami Experience',
      slug: 'kashmiri-wazwan-ceremonial-7-dish-traami',
      description: `The pinnacle of Himalayan culinary artistry: Rista, Rogan Josh, Daniwal Korma, Aab Gosh, Tabak Maaz, and Gushtaba served traditionally in engraved copper traamis.`,
      tags: ['wazwan', 'kashmiri feast', 'gushtaba', 'rogan josh', 'copper traami'],
      images: ['https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: '10 Traami Intimate Wazwan (40 Guests)',
          description: '10 engraved copper traamis each serving 4 guests with 7 classic Wazwan delicacies.',
          price: 1200,
          hours: '4 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['10 Copper Traamis (40 Servings)', 'Authentic Rista, Rogan Josh, Gushtaba', 'Saffron Kahwa Tea Bar', 'Tash-t-Nari Handwashing Ceremony'],
        },
        {
          title: '25 Traami Grand Wedding Wazwan (100 Guests)',
          description: '25 copper traamis loaded with hand-pounded tender meatballs, crispy lamb ribs, and saffron pulao.',
          price: 2800,
          hours: '5 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['25 Copper Traamis (100 Guests)', 'All 7 Classic Wazwan Dishes', 'Traditional Master Waza Chefs', 'Saffron Kahwa & Phirni Dessert'],
        },
        {
          title: 'Palace Wazwan Banquet (250 Guests)',
          description: 'The ultimate royal Himalayan celebration feast with 60+ copper traamis, live saffron brewing, and ceremonial hospitality.',
          price: 6500,
          hours: '6 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Serves 250 Guests', 'Full Traditional Royal Protocol', 'Lead Master Waza + 8 Cooks', 'Unlimited Saffron Kahwa'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'live-banquet-stations',
      vendor: 'epicurean',
      title: 'Artisanal Wood-Fired Mediterranean & Neapolitan Pizza Station',
      slug: 'wood-fired-mediterranean-neapolitan-pizza-station',
      description: `A mobile copper-clad wood-fired oven reaching 900°F on-site, producing blistered Neapolitan pizzas, roasted sea bass, and rosemary focaccia in 90 seconds.`,
      tags: ['wood fired pizza', 'mobile oven', 'mediterranean catering', 'live station'],
      images: ['https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Artisan Pizza Buffet (50 Guests)',
          description: 'Mobile oven, certified pizzaiolo, 4 gourmet pizza choices, and organic arugula lemon salad.',
          price: 900,
          hours: '3 Hours Live Cooking',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['50 Guests Unlimited Pizzas', '4 Classic & Gourmet Flavors', 'Wood-fired Oven On-site', 'Eco-friendly Serving Boards'],
        },
        {
          title: 'Mediterranean Celebration Feast (120 Guests)',
          description: 'Unlimited wood-fired pizzas, roasted seasonal vegetables, burrata salad, and wood-fired Nutella dessert calzones.',
          price: 1950,
          hours: '4 Hours Live Cooking',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['120 Guests Unlimited Food', 'Charcuterie & Burrata Appetizer Bar', 'Wood-Fired Nutella Calzones', '2 Chefs & 1 Server'],
        },
        {
          title: 'Tuscan Grand Gala (250 Guests)',
          description: 'Dual mobile ovens, wood-fired pizzas, roasted whole lamb leg skewers, and antipasti grazing table.',
          price: 3900,
          hours: '5 Hours Live Cooking',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['2 Mobile Wood-Fired Ovens', '20ft Antipasti Grazing Table', 'Whole Roast Skewers', '3 Master Chefs & 4 Servers'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'ceremonial-desserts',
      vendor: 'sweetdelights',
      title: 'Artisanal Gelato Cart & Belgian Waffle Live Station',
      slug: 'artisanal-gelato-cart-belgian-waffle-station',
      description: `Vintage-styled Italian gelato cart offering 8 handcrafted small-batch gelato and sorbetto flavors with freshly pressed Belgian Liege waffles.`,
      tags: ['gelato cart', 'waffle bar', 'vintage cart', 'event dessert'],
      images: ['https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Sweet Scoop Cart (75 Guests)',
          description: '2 hours of unlimited gelato served in waffle cones and cups with 4 artisanal flavor choices.',
          price: 450,
          hours: '2 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Vintage White Mobile Cart', '4 Gourmet Gelato Flavors', 'Waffle Cones & Eco Spoons', 'Uniformed Attendant'],
        },
        {
          title: 'Gelato & Warm Liege Waffles (150 Guests)',
          description: 'Live waffle pressing, 6 gelato flavors, warm Belgian chocolate drizzle, and fresh strawberry compote.',
          price: 850,
          hours: '3 Hours Service',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Live Waffle Iron Station', '6 Gelato Flavors', 'Warm Chocolate & Caramel Drizzle', '2 Attendants & Complete Setup'],
        },
        {
          title: 'Imperial Ice Cream Extravaganza (300 Guests)',
          description: '3 hours unlimited gelato for 300 guests, live waffles, milkshakes, and personalized custom branded wafer discs.',
          price: 1600,
          hours: '3 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Serves up to 300 Guests', '8 Gelato & Sorbet Flavors', 'Custom Edible Logo Wafers', 'Milkshake Blending Station'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'artisanal-wedding-dining',
      vendor: 'epicurean',
      title: 'Grand Whole-Roast Barbecue & Carvery Ceremony Station',
      slug: 'grand-whole-roast-barbecue-carvery-ceremony',
      description: `Smoked low-and-slow for 14 hours over applewood and hickory. Expert pitmasters carving succulent brisket, roasted lamb saddles, and rotisserie poultry live for your guests.`,
      tags: ['bbq catering', 'carvery station', 'smoked brisket', 'live carving'],
      images: ['https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Smoked Carvery Station (75 Guests)',
          description: 'Chef-carved applewood smoked brisket and pulled chicken with artisanal slider buns and slaw.',
          price: 1250,
          hours: '3 Hours Live Carving',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['14-Hour Smoked Brisket & Chicken', '3 Homemade Craft BBQ Sauces', 'Mac & Cheese and Slaw Sides', '1 Master Carver Chef'],
        },
        {
          title: 'Grand Pitmaster Feast (150 Guests)',
          description: 'Whole roast lamb or pig, USDA Prime brisket, baby back ribs, cornbread, and roasted sweet potatoes.',
          price: 2500,
          hours: '4 Hours Live Carving',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Prime Brisket + Whole Lamb Saddle', '3 Homestyle Southern Sides', 'Honey Glazed Cornbread', '2 Pitmasters & Service Line'],
        },
        {
          title: 'King’s Feast Whole Animal Roast (250 Guests)',
          description: 'Showpiece whole animal spit-roast on open charcoal fire with complete country buffet and dessert cobblers.',
          price: 4500,
          hours: '6 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Whole Animal Spit Roast Display', 'All Smoked Meats Included', 'Warm Peach & Berry Cobbler Bar', 'Full Carving Team & Service Crew'],
        },
      ],
    },
    {
      category: 'cooking-ceremonies',
      subcategory: 'family-ceremony-cooking',
      vendor: 'epicurean',
      title: 'Pure Vegetarian / Sattvic Jain Ceremonial Cuisine Specialist',
      slug: 'pure-vegetarian-sattvic-jain-ceremony-cuisine',
      description: `Dedicated strictly vegetarian and Jain culinary team preparing immaculate feasts without root vegetables, garlic, or onion, strictly honoring spiritual traditions.`,
      tags: ['vegetarian wedding', 'jain food', 'sattvic feast', 'pure veg'],
      images: ['https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Sattvic Feast for 75 Guests',
          description: 'Traditional Gujarati/Marwari pure vegetarian feast with Kadhi, Gujarati Daal, Rotlis, Paneer, and Shrikhand.',
          price: 850,
          hours: '3 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['100% Strictly Vegetarian/Jain', 'Gourmet Paneer & Daal', 'Piping Hot Phulkas', 'Kesar Shrikhand Dessert'],
        },
        {
          title: 'Grand Jain Wedding Banquet (150 Guests)',
          description: 'Multi-course luxury vegetarian banquet: Chaats, Live Khichdi Counter, Paneer delicacies, and Malpua Rabri.',
          price: 1800,
          hours: '4 Hours Service',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Live Sattvic Chaat Bar', '3 Curries + Pulao + Bread Basket', 'Live Malpua with Kesar Rabri', '4 Servers Included'],
        },
        {
          title: 'Imperial Vegetarian Gala (300 Guests)',
          description: '30-dish royal banquet including South Indian, North Indian, and Indo-Chinese counters honoring all dietary principles.',
          price: 3600,
          hours: '5 Hours Service',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['30 Distinct Vegetarian Delicacies', 'Live Tawa Sabzi Counter', 'Royal Halwa Display Bar', 'Full Buffet Furniture & Crew'],
        },
      ],
    },

    // ----------------------------------------------------
    // 4. PARTY ARRANGEMENT (4 services)
    // ----------------------------------------------------
    {
      category: 'party-arrangement',
      subcategory: 'cocktail-mocktail-bar',
      vendor: 'velvetpour',
      title: 'Craft Mixology & Dry-Ice Cocktail / Mocktail Mobile Bar Experience',
      slug: 'craft-mixology-dry-ice-cocktail-mocktail-bar',
      description: `### High-Fashion Mixology for Private Soirées
Our flair bartenders craft smoked, bubbling dry-ice sensory cocktails and zero-proof artisanal botanical mocktails that ignite any celebration.`,
      tags: ['cocktail bar', 'mocktails', 'bartender', 'mixology', 'private party'],
      images: ['https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Mocktail & Juice Bar (50 Guests)',
          description: '4 hours of botanical artisanal mocktails, fresh purées, cold-pressed juices, and garnishes.',
          price: 450,
          hours: '4 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['1 Master Mixologist', '4 Custom Signature Mocktails', 'Crystal Glassware Rental', 'Gourmet Dehydrated Garnishes'],
        },
        {
          title: 'Smoked & Dry-Ice Cocktail Bar (100 Guests)',
          description: 'Dual bartenders, portable LED bar, smoked cloches, dry-ice fog effect, and custom drink menus.',
          price: 950,
          hours: '5 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['2 Certified Mixologists', 'Dry-Ice Bubbling Cocktails', 'Smoked Oak Old Fashioned Bar', 'Mobile Tufted Leather Bar'],
        },
        {
          title: 'Celebrity Platinum Mixology Suite (200 Guests)',
          description: '3 bartenders, custom ice sculptures with liquor luge, molecular caviar spheres, and champagne tower.',
          price: 1950,
          hours: '6 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['3 Master Mixologists + 1 Barback', '5-Tier Champagne Tower', 'Molecular Cocktail Spheres', 'Custom Carved Ice Luge'],
        },
      ],
    },
    {
      category: 'party-arrangement',
      subcategory: 'party-sound-lighting',
      vendor: 'windycity',
      title: 'Concert Stage, Trussing, Lasers & Sound System for Private Galas',
      slug: 'concert-stage-trussing-lasers-sound-gala',
      description: `Turn any banquet hall or outdoor field into a world-class concert venue with heavy-duty aluminum box trussing, line-array speakers, and digital sound engineers.`,
      tags: ['concert sound', 'stage trussing', 'lighting effects', 'private gala'],
      images: ['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Gala Audio & Stage Glow',
          description: 'Line array sound for up to 150 guests, 12 wireless LED room uplights, and wireless microphones.',
          price: 850,
          hours: '5 Hours Rental',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Line Array Sound System', '12 Architectural Uplights', '2 Shure Wireless Mics', 'Dedicated Sound Technician'],
        },
        {
          title: 'Full Trussing & Moving Beams (300 Guests)',
          description: 'Aluminum goalpost truss, 6 computerized moving-head beam lights, dual 18-inch subwoofers, and hazer.',
          price: 1800,
          hours: 'Full Event',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['15ft Aluminum Box Truss', '6 Computerized Moving Lights', 'Water-based Atmospheric Hazer', 'Live Lighting Operator'],
        },
        {
          title: 'Festival Stage Mega-Production',
          description: 'Complete 24x16ft elevated stage, concert roof canopy, full laser mapping show, and 10,000-watt audio array.',
          price: 4500,
          hours: 'Full Weekend',
          turnaround: 'Multi-day',
          isPopular: false,
          features: ['24x16ft Modular Stage', 'Concert Ground-Support Truss', 'Full RGB Laser Show', 'Live Audio & Lighting Engineers'],
        },
      ],
    },
    {
      category: 'party-arrangement',
      subcategory: 'photo-booths-360',
      vendor: 'luminary',
      title: '360 Spinning Video Booth & Glam Kardashian Black-and-White Photo Station',
      slug: '360-video-booth-glam-kardashian-photo-station',
      description: `Give guests unforgettable social-media content with our high-speed 360-degree rotating video platform with slow-motion FX and instant AirDrop/QR sharing.`,
      tags: ['360 photo booth', 'glam booth', 'video booth', 'event photography'],
      images: ['https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Classic 360 Video Booth (3 Hours)',
          description: '360 revolving platform fitting 3-4 guests, custom branded video overlay, slow-mo, and instant sharing.',
          price: 450,
          hours: '3 Hours',
          turnaround: 'Instant Video',
          isPopular: false,
          features: ['360 Slow-Motion Platform', 'Custom Event Graphic Overlay', 'Instant QR/AirDrop Sharing', '1 Friendly Attendant'],
        },
        {
          title: 'Dual 360 Booth + Glam Print Station (4 Hours)',
          description: '360 video platform + Hollywood black-and-white skin-smoothing photo booth with instant 4x6 magnetic prints.',
          price: 850,
          hours: '4 Hours',
          turnaround: 'Instant Prints',
          isPopular: true,
          features: ['360 Video Platform', 'Skin-Smoothing Glam Filter', 'Unlimited 4x6 Magnetic Prints', 'Red Carpet & Gold Stanchions'],
        },
        {
          title: 'VIP Celebrity Hologram & Enclosed Studio',
          description: 'Custom enclosed mirrored LED infinity tunnel 360 booth with cold sparks and personalized prop suite.',
          price: 1550,
          hours: '5 Hours',
          turnaround: 'Instant Media',
          isPopular: false,
          features: ['Infinity Mirror LED Enclosure', 'Cold Spark Firework FX', 'Custom Props & Money Guns', 'Online Live Event Gallery'],
        },
      ],
    },
    {
      category: 'party-arrangement',
      subcategory: 'event-coordination',
      vendor: 'luminary',
      title: 'Luxury Private Party Concierge & Floor Director',
      slug: 'luxury-private-party-concierge-floor-director',
      description: `Seamless coordination for anniversary parties, engagement celebrations, and milestone galas. Our directors oversee caterers, bar speed, cue entertainment, and maintain VIP hospitality.`,
      tags: ['party coordinator', 'floor manager', 'private event', 'anniversary party'],
      images: ['https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: '4-Hour Party Directing',
          description: 'On-site lead coordinator managing guest check-in, vendor arrivals, food replenishment, and toast cues.',
          price: 350,
          hours: '4 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Vendor Schedule Management', 'Toast & Speech Timing', 'Guest Welcoming', 'Emergency Problem Solving'],
        },
        {
          title: 'Full Soirée Management (8 Hours)',
          description: 'Floor director + assistant managing setup, caterers, bar flow, entertainment cues, and post-party venue handover.',
          price: 750,
          hours: '8 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Lead Director + Assistant', 'Catering & Bar Coordination', 'Timeline Enforcement', 'Complete Teardown Supervision'],
        },
        {
          title: 'Weekend Estate Party Orchestration',
          description: 'Multi-event coordination for weekend property parties: welcome cocktails, main dinner party, and farewell brunch.',
          price: 1650,
          hours: 'Weekend Service',
          turnaround: 'Multi-day',
          isPopular: false,
          features: ['3 Distinct Parties Managed', 'Valet & Security Liaison', 'Full Guest Hospitality Care', 'Zero Stress Guarantee'],
        },
      ],
    },

    // ----------------------------------------------------
    // 5. TRADITIONAL SERVICES (4 services)
    // ----------------------------------------------------
    {
      category: 'traditional-services',
      subcategory: 'traditional-folk-music',
      vendor: 'windycity',
      title: 'Traditional Shehnai, Dhol & Sitar Live Cultural Ensemble',
      slug: 'traditional-shehnai-dhol-sitar-live-ensemble',
      description: `### Authentic Traditional Instrumental Majesty
Enrich ceremonial moments with sacred live acoustic music: soul-stirring morning Shehnai for bridal rituals, thunderous celebratory live Dhols for entrances, and meditative classical Sitar melodies for banquets.`,
      tags: ['shehnai', 'dhol players', 'sitar', 'traditional music', 'cultural ceremony'],
      images: ['https://images.unsplash.com/photo-1587271407850-8d438ca9fdf2?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Dhol Entrance Duo',
          description: '2 high-energy master Dhol drummers in traditional regal attire leading the groom’s or bridal entrance.',
          price: 400,
          hours: '1 Hour On-site',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['2 Master Dhol Players', 'Traditional Embroidered Costumes', 'Explosive High-Energy Beats', 'Photo Op with Wedding Party'],
        },
        {
          title: 'Ceremony Sitar & Tabla Duo (3 Hours)',
          description: 'Classical Hindustani classical sitar and tabla performance creating an atmospheric, royal acoustic backdrop.',
          price: 750,
          hours: '3 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Master Sitarist + Tabla Player', 'Acoustic Sound System Included', 'Traditional Raags for Ceremonies', 'Elegant Stage Rugs Included'],
        },
        {
          title: 'Imperial 5-Piece Heritage Ensemble',
          description: 'Full ceremonial orchestra: Shehnai, Flute, Santoor, Sitar, and Tabla plus 2 Dhol players for the grand departure.',
          price: 1650,
          hours: '5 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['5 Classical Instrumentalists', '2 Dhol Players for Procession', 'Traditional Shehnai Auspicious Tunes', 'Full Stage Audio Engineering'],
        },
      ],
    },
    {
      category: 'traditional-services',
      subcategory: 'traditional-attire-draping',
      vendor: 'bloom',
      title: 'Master Turban (Paghri / Safa) Tying & Saree Draping Concierge',
      slug: 'master-turban-safa-tying-saree-draping',
      description: `Preserve the royal elegance of cultural ceremonies with expert on-site stylists who drape traditional sarees, lehengas, and tie pristine royal Rajasthani or Jodhpuri safas for the groom and wedding guests.`,
      tags: ['turban tying', 'safa artist', 'saree draping', 'traditional attire'],
      images: ['https://images.unsplash.com/photo-1582879304171-8041c73b0368?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Groom Royal Safa & Brooch Styling',
          description: 'Pristine traditional royal turban tied with custom pleating, kalgi brooch placement, and stole draping.',
          price: 180,
          hours: '1 Hour',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Groom Royal Turban Tie', 'Kalgi & Pearl Haar Placement', 'Sword / Stole Draping', 'All Turban Fabrics Provided'],
        },
        {
          title: 'Groom + 15 Baraati Guests Safa Station',
          description: 'Lead safa master tying matching royal turbans for the groom plus 15 prominent groomsmen and family members.',
          price: 550,
          hours: '2.5 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Groom Royal Safa', '15 Matching Guest Turbans', 'Fast 3-min Tying Speed', 'Fabrics & Pins Included'],
        },
        {
          title: 'Full Wedding Party Turban & Saree Suite (40 Guests)',
          description: '2 turban masters + 1 saree draping artist servicing up to 40 male guests and draping 10 female sarees/lehengas.',
          price: 1200,
          hours: '4 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['40 Turbans Tied with Fabric Included', '10 Professional Saree/Lehenga Drapes', '3 Master Stylists on Site', 'Safety Pins & Pleat Steaming'],
        },
      ],
    },
    {
      category: 'traditional-services',
      subcategory: 'haldi-pithi-ceremony',
      vendor: 'bloom',
      title: 'Traditional Haldi & Pithi Floral Ceremony Setup & Turmeric Paste Crafting',
      slug: 'traditional-haldi-pithi-floral-setup',
      description: `Elevate the joyful yellow Haldi ceremony with brass urlis, marigold flower curtains, raw turmeric paste blended with sandalwood and rosewater, and yellow canopy tents.`,
      tags: ['haldi ceremony', 'pithi', 'marigold decor', 'brass urli', 'turmeric ritual'],
      images: ['https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Marigold Backdrop & Brass Urli',
          description: 'Large carved brass urli bowl for the bride/groom to sit in, surrounded by 8 marigold garlands and yellow drapes.',
          price: 450,
          hours: '3 Hours Setup',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Giant Handcrafted Brass Urli', 'Fresh Marigold Floral Curtains', 'Yellow Velvet Seating Stool', 'Organic Sandalwood Turmeric Paste'],
        },
        {
          title: 'Sunflower & Marigold Garden Canopy',
          description: '10x10ft wooden canopy wrapped in fresh orange and yellow marigolds, 4 floral brass bowls, and yellow floor rugs.',
          price: 950,
          hours: '4 Hours Setup',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['10x10ft Marigold Floral Canopy', 'Brass Urli Seating Centerpiece', 'Flower Petal Shower Baskets (10kg)', 'Haldi Floral Jewelry for Bride'],
        },
        {
          title: 'Grand Haldi Carnival Experience',
          description: 'Complete Haldi festival: double canopy, sunglasses giveaways, yellow flower shower cannon, and acoustic folk singer.',
          price: 1950,
          hours: 'Full Day Setup',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Double Ceremony Urli Setup', 'Rose Petal Air Cannon', 'Folk Singer & Harmonium (2 Hours)', 'Custom Yellow Haldi Favors'],
        },
      ],
    },
    {
      category: 'traditional-services',
      subcategory: 'cultural-rituals',
      vendor: 'luminary',
      title: 'Ancestral Blessing & Sacred Ceremony Stage Layout & Samagri Curation',
      slug: 'ancestral-blessing-sacred-ceremony-stage-layout',
      description: `Complete authentic sacred ritual preparation: purified copper havankund with smokeless camphor and woods, curated herbal samagri, and auspicious seating orientation.`,
      tags: ['sacred ceremony', 'havan', 'cultural ritual', 'puja samagri'],
      images: ['https://images.unsplash.com/photo-1582879304171-8041c73b0368?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Sacred Fire & Samagri Package',
          description: 'Copper havankund, purified smokeless mango wood, organic ghee, sacred samagri, and low wooden patlas.',
          price: 320,
          hours: '2 Hours Prep',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Pure Copper Havankund Riser', 'Smokeless Dried Woods & Ghee', 'Complete 21-Item Ritual Samagri', '4 Low Wooden Seating Patlas'],
        },
        {
          title: 'Full Temple Stage & Floral Canopy',
          description: 'Raised platform with carved wooden pillars, sacred fire area with ventilation fans, and fresh mango-leaf torans.',
          price: 850,
          hours: '4 Hours Setup',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Raised Ritual Platform', 'Fresh Mango Leaf & Marigold Torans', 'Silent Smoke-Extraction Fan', 'Coconut & Kalash Setup'],
        },
        {
          title: 'Grand Vedic Heritage Mandap',
          description: 'Temple architecture mandap, traditional brass oil lamps (Diya towers), fresh coconut pillars, and complete priest coordination.',
          price: 1750,
          hours: 'Full Day Setup',
          turnaround: 'Day of Event',
          isPopular: false,
          features: ['Temple Carved Architectural Riser', 'Four 5-ft Tall Brass Diya Towers', 'Complete Samagri & Priest Liaison', 'Post-Ritual Cleanliness Protocol'],
        },
      ],
    },

    // ----------------------------------------------------
    // 6. OTHERS (3 services)
    // ----------------------------------------------------
    {
      category: 'others',
      subcategory: 'drone-aerial',
      vendor: 'luminary',
      title: 'Nighttime Aerial Drone Light Show & Grand Ceremonial Fireworks',
      slug: 'nighttime-aerial-drone-light-show-fireworks',
      description: `### Breathtaking Night Sky Spectacles
Illuminate the night sky above your ceremony or milestone birthday with a synchronized fleet of 50 to 200 LED drones forming names, wedding rings, and hearts, accompanied by low-noise cold fireworks.`,
      tags: ['drone show', 'fireworks', 'aerial light show', 'ceremony finale'],
      images: ['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Cold-Spark & Fog Grand Finale',
          description: '6 indoor/outdoor cold-spark pyrotechnic fountains firing up to 15ft with dense low-lying cloud fog.',
          price: 750,
          hours: '1 Hour Execution',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['6 Cold-Spark Fountains (No Burn Risk)', 'Dry-Ice Cloud Fog Machine', 'Licensed Pyrotechnic Operator', 'Safety Permits Handled'],
        },
        {
          title: '50-Drone Synchronized Sky Light Show',
          description: '10-minute choreographed drone show displaying couple’s names, interlocking rings, and custom birthday messages.',
          price: 3200,
          hours: '10-min Sky Show',
          turnaround: 'Night of Event',
          isPopular: true,
          features: ['50 Synchronized LED Drones', '3 Custom 3D Sky Formations', 'FAA Certified Pilots', 'Airspace Clearances Included'],
        },
        {
          title: 'Imperial 150-Drone + Pyromusical Spectacular',
          description: '15-minute 150-drone light show synchronized to your favorite love song soundtrack, ending in a cascade of fireworks.',
          price: 7900,
          hours: '15-min Sky Show',
          turnaround: 'Night of Event',
          isPopular: false,
          features: ['150 Synchronized Drones', '6 Custom Formations & Logo/Names', 'Musical Audio Synchronization', 'Grand Finale Firework Salute'],
        },
      ],
    },
    {
      category: 'others',
      subcategory: 'vip-concierge',
      vendor: 'luminary',
      title: 'Luxury Fleet Chauffeur, Rolls-Royce Vintage Getaway & Guest Shuttles',
      slug: 'luxury-fleet-chauffeur-vintage-getaway',
      description: `Make an unforgettable entrance and departure with vintage 1958 Rolls-Royce Silver Cloud wedding getaway cars and luxury Mercedes-Benz Sprinter guest shuttles.`,
      tags: ['rolls royce', 'wedding car', 'chauffeur', 'vip transport'],
      images: ['https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: 'Vintage Rolls-Royce Getaway (3 Hours)',
          description: 'Chauffeured 1958 Rolls-Royce Silver Cloud with red carpet, "Just Married" ribbon, and chilled champagne.',
          price: 650,
          hours: '3 Hours',
          turnaround: 'Same Day',
          isPopular: true,
          features: ['Pristine Vintage Rolls-Royce', 'Uniformed Chauffeur in Tuxedo', 'Red Carpet Arrival & Departure', 'Complimentary Champagne Toast'],
        },
        {
          title: 'Bridal Car + 14-Passenger Executive Sprinter',
          description: 'Vintage bridal getaway car + luxury Mercedes Sprinter running guest loops between hotel and venue for 6 hours.',
          price: 1450,
          hours: '6 Hours',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Vintage Rolls-Royce for Couple', '14-Passenger Luxury Sprinter Van', '6 Hours Continuous Shuttle Loops', 'Leather Reclining Seats & WiFi'],
        },
        {
          title: 'Imperial Presidential Escort Fleet',
          description: 'Rolls-Royce Ghost, two black Cadillac Escalade ESVs, and two 24-passenger mini-coaches for full-day VIP care.',
          price: 3200,
          hours: '10 Hours Full Day',
          turnaround: 'Same Day',
          isPopular: false,
          features: ['Rolls-Royce Ghost for Couple', '2 Black Escalade VIP Security SUVs', 'Two 24-Passenger Mini-Coaches', 'Dedicated Transport Dispatcher'],
        },
      ],
    },
    {
      category: 'others',
      subcategory: 'invitations-favors',
      vendor: 'sweetdelights',
      title: 'Handcrafted Velvet Box Invitations & Gold-Embossed Favors',
      slug: 'handcrafted-velvet-box-invitations-favors',
      description: `Luxury bespoke wedding invitations presented in velvet keepsake boxes with acrylic gold-foil etched invitations, wax seals, and personalized thank-you favor boxes.`,
      tags: ['invitations', 'velvet box', 'wedding favors', 'gold foil', 'calligraphy'],
      images: ['https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80'],
      packages: [
        {
          title: '100 Gold-Foil Acrylic Invitations',
          description: '100 clear acrylic cards with mirror gold-foil typography, custom wax seals, and handmade cotton envelopes.',
          price: 550,
          hours: 'Delivery Included',
          turnaround: '10 Days Notice',
          isPopular: false,
          features: ['100 2mm Clear Acrylic Cards', 'Metallic Gold-Foil Print', 'Handmade Deckled Cotton Envelopes', 'Custom Initial Wax Stamp'],
        },
        {
          title: '150 Velvet Boxed Keepsake Invitations',
          description: '150 royal velvet hinged boxes holding gold-etched acrylic cards, insert RSVP cards, and custom monogram brooch.',
          price: 1350,
          hours: 'Delivery Included',
          turnaround: '14 Days Notice',
          isPopular: true,
          features: ['150 Royal Velvet Keepsake Boxes', 'Custom Monogram Metal Brooch', 'Gold-Edged Insert RSVP Cards', 'Calligraphy Addressed Envelopes'],
        },
        {
          title: 'Complete Suite: 200 Invitations + 200 Guest Favors',
          description: '200 velvet boxed invitations plus 200 matching luxury gold-embossed sweet/perfume favor boxes for the ceremony.',
          price: 2450,
          hours: 'Delivery Included',
          turnaround: '21 Days Notice',
          isPopular: false,
          features: ['200 Velvet Boxed Invitations', '200 Matching Favor Keepsake Boxes', 'Digital RSVP Tracking Website', 'White-Glove Insured Delivery'],
        },
      ],
    },
  ];

  let createdCount = 0;

  for (const item of gigsData) {
    const cat = createdCategories[item.category];
    if (!cat) continue;
    const catId = cat.id;
    const subCatId = cat.subMap[item.subcategory] || null;
    const vendorId = getVendor(item.vendor);

    // Create Gig
    const gig = await prisma.gig.create({
      data: {
        vendorProfileId: vendorId,
        categoryId: catId,
        subCategoryId: subCatId,
        title: item.title,
        slug: item.slug,
        description: item.description,
        status: GigStatus.ACTIVE,
        tags: item.tags,
        viewCount: Math.floor(Math.random() * 250) + 40,
        orderCount: Math.floor(Math.random() * 15) + 1,
        impressionCount: Math.floor(Math.random() * 1200) + 200,
        clickCount: Math.floor(Math.random() * 180) + 30,
        packages: {
          create: item.packages.map((pkg, idx) => ({
            vendorProfileId: vendorId,
            title: pkg.title,
            description: pkg.description,
            price: pkg.price,
            hours: pkg.hours,
            turnaround: pkg.turnaround,
            isPopular: pkg.isPopular,
            features: pkg.features,
            sortOrder: idx + 1,
            escrowSplitJson: [
              { milestoneName: 'Deposit & Date Reservation', percentage: 30, dueWhen: 'Contract Acceptance' },
              { milestoneName: 'Preparation & Resource Allocation', percentage: 40, dueWhen: '7 Days Prior to Event' },
              { milestoneName: 'Final Delivery & Inspection', percentage: 30, dueWhen: 'Event Completion' },
            ],
          })),
        },
        gallery: {
          create: item.images.map((url, idx) => ({
            url,
            type: 'image',
            sortOrder: idx + 1,
          })),
        },
      },
    });

    createdCount++;
  }

  console.log(`🎉 Successfully created ${createdCount} active services across all requested categories!`);
}

reseedServices()
  .catch((e) => {
    console.error('❌ Error during reseedServices:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
