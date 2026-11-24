import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { DevLedgerController } from './dev-ledger.controller.js';
import { DevPaymentsController } from './dev-payments.controller.js';
import { DevController } from './dev.controller.js';

@Module({
  imports: [CampaignsModule, LedgerModule, PaymentsModule],
  controllers: [DevController, DevLedgerController, DevPaymentsController],
})
export class DevModule {}
