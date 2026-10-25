import { Module } from '@nestjs/common';
import { FamilyHubController } from './family-hub.controller';
import { FamilyHubService } from './family-hub.service';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [MessagesModule],
  controllers: [FamilyHubController],
  providers: [FamilyHubService],
  exports: [FamilyHubService],
})
export class FamilyHubModule {}
