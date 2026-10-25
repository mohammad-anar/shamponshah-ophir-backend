ALTER TYPE "MilestoneStatus" ADD VALUE IF NOT EXISTS 'FUNDED';
ALTER TYPE "MilestoneStatus" ADD VALUE IF NOT EXISTS 'APPROVED_PENDING_RELEASE';
ALTER TABLE "milestones" ADD COLUMN "stripePaymentIntentId" TEXT;
ALTER TABLE "client_profiles" ADD COLUMN "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX "client_profiles_stripeCustomerId_key" ON "client_profiles"("stripeCustomerId");
CREATE UNIQUE INDEX "earnings_milestoneId_key" ON "earnings"("milestoneId");
