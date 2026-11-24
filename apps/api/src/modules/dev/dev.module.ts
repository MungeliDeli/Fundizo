import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { DevLedgerController } from './dev-ledger.controller.js';
import { DevController } from './dev.controller.js';

@Module({
  imports: [CampaignsModule, LedgerModule],
  controllers: [DevController, DevLedgerController],
})
export class DevModule {}
