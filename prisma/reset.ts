import { Pool } from 'pg';
import 'dotenv/config';

async function resetDatabase() {
  if (process.env.NODE_ENV === 'production') {
    console.error('⛔ FATAL: Database reset is blocked in PRODUCTION environment!');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set in environment.');
    process.exit(1);
  }

  console.log('================================================================');
  console.log('⚠️  DEVELOPMENT DATABASE RESET INITIATED');
  console.log('================================================================');
  console.log('📋 Backup Notice:');
  console.log('   Before resetting the database, you can create a backup dump via:');
  console.log('   pg_dump -U postgres -h localhost -p 5433 -d hello-db > db_backup_$(date +%Y%m%d_%H%M%S).sql');
  console.log('----------------------------------------------------------------');

  const pool = new Pool({ connectionString });

  try {
    console.log('🧹 Truncating application tables with CASCADE (preserving _prisma_migrations)...');

    await pool.query(`
      TRUNCATE TABLE 
        gig_reports,
        reviews,
        notifications,
        messages,
        conversations,
        conversation_participants,
        dispute_messages,
        disputes,
        milestones,
        earnings,
        wallet_ledger_entries,
        vendor_wallets,
        transactions,
        stripe_webhook_events,
        orders,
        offers,
        jobs,
        daily_gig_analytics,
        daily_vendor_analytics,
        gig_gallery_items,
        gig_packages,
        portfolio_items,
        gigs,
        vendor_categories,
        sub_categories,
        categories,
        events,
        family_board_items,
        family_boards,
        family_members,
        family_workspaces,
        saved_vendors,
        blocked_dates,
        level_history,
        level_rules,
        platform_settings,
        audit_logs,
        bid_credit_packages,
        bid_credit_transactions,
        payment_methods,
        admin_profiles,
        client_profiles,
        vendor_profiles,
        users
      RESTART IDENTITY CASCADE;
    `);

    console.log('✅ All application tables cleaned successfully!');
    console.log('💡 Run "npm run db:seed" next to create the Admin account, Platform settings, and Level rules.');
  } catch (error) {
    console.error('❌ Error during database reset:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetDatabase();
