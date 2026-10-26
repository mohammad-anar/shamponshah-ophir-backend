import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Infrastructure
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StripeModule } from './stripe/stripe.module';

// Domain Modules
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { CategoriesModule } from './categories/categories.module';
import { GigsModule } from './gigs/gigs.module';
import { JobsModule } from './jobs/jobs.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { FamilyHubModule } from './family-hub/family-hub.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagesModule } from './messages/messages.module';
import { AdminModule } from './admin/admin.module';
import { ContactModule } from './contact/contact.module';
import { UploadModule } from './upload/upload.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    // ── Environment Configuration ──────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── Global Infrastructure ─────────────────────────────────
    PrismaModule,
    RedisModule,
    StripeModule,
    NotificationsModule,

    // ── Application Features ──────────────────────────────────
    AuthModule,
    UsersModule,
    VendorsModule,
    CategoriesModule,
    GigsModule,
    JobsModule,
    OrdersModule,
    PaymentsModule,
    FamilyHubModule,
    ReviewsModule,
    MessagesModule,
    AdminModule,
    ContactModule,
    UploadModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
