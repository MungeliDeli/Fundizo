import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { type DevLedgerResponse, DevTestDonationRequest } from '@fundizo/shared';
import type { Response } from 'express';
import { Errors } from '../../common/app-error.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import { OutboxRelay } from '../../jobs/outbox-relay.js';
import { CampaignDirectory } from '../campaigns/campaign-directory.service.js';
import { type AccountLabelParts, LedgerService } from '../ledger/ledger.service.js';
import { NORMAL_BALANCE } from '../ledger/posting.js';

const KIND_LABEL: Record<string, string> = {
  campaign_funds: 'Held for',
  platform_tips: 'Fundizo tips',
  network_fees: 'Network fees',
  provider_clearing: 'Mobile money wallet',
};

/**
 * Development only (DevModule isn't loaded in production): look inside the ledger and the job
 * queue, and post a pretend donation to watch totals move before real payments exist (slice 6).
 */
@Controller('dev/ledger')
export class DevLedgerController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ledger: LedgerService,
    private readonly campaigns: CampaignDirectory,
    private readonly relay: OutboxRelay,
  ) {}

  @Get()
  async overview(@Res({ passthrough: true }) res: Response): Promise<DevLedgerResponse> {
    res.setHeader('Cache-Control', 'no-store');
    const [books, published, jobs] = await Promise.all([
      this.ledger.overview(),
      this.campaigns.listPublished(),
      this.relay.status(),
    ]);
    const raised = await this.ledger.campaignFunds(published.map((c) => c.id));
    const titles = new Map(published.map((c) => [c.id, c.title]));
    const label = (a: AccountLabelParts) =>
      a.kind === 'campaign_funds'
        ? `${KIND_LABEL[a.kind]}: ${(a.ownerId && titles.get(a.ownerId)) || 'a fundraiser'}`
        : [KIND_LABEL[a.kind], a.network, a.provider && `via ${a.provider}`]
            .filter(Boolean)
            .join(' · ');
    return {
      totals: {
        debitsNgwee: books.totalDebitsNgwee,
        creditsNgwee: books.totalCreditsNgwee,
        transactionCount: books.transactionCount,
        balanced: books.totalDebitsNgwee === books.totalCreditsNgwee,
      },
      accounts: books.accounts.map((a) => ({
        kind: a.kind,
        label: label(a),
        normal: NORMAL_BALANCE[a.kind],
        balanceNgwee: a.balanceNgwee,
      })),
      recent: books.recent.map((t) => ({
        ...t,
        lines: t.lines.map((l) => ({ ...l, account: label(l.account) })),
      })),
      campaigns: published
        .filter((c): c is typeof c & { slug: string } => c.slug !== null)
        .map((c) => ({ slug: c.slug, title: c.title, raisedNgwee: raised.get(c.id) ?? 0 })),
      jobs,
    };
  }

  /** A pretend, already-settled donation: wallet ← donor; campaign and tips ← wallet. */
  @Post('test-donation')
  @HttpCode(201)
  async testDonation(
    @Body({ schema: DevTestDonationRequest }) body: DevTestDonationRequest,
  ): Promise<{ ok: true }> {
    const campaign = await this.campaigns.getPublishedBySlug(body.campaignSlug);
    if (!campaign) throw Errors.notFound();
    const wallet = { kind: 'provider_clearing', provider: 'FAKE', network: body.network } as const;
    await this.db.transaction((tx) =>
      this.ledger.post(tx, {
        kind: 'dev_test_donation',
        ref: { type: 'dev_test', id: randomUUID() },
        lines: [
          { account: wallet, debitNgwee: body.amountNgwee + body.tipNgwee },
          {
            account: { kind: 'campaign_funds', campaignId: campaign.id },
            creditNgwee: body.amountNgwee,
          },
          ...(body.tipNgwee > 0
            ? [{ account: { kind: 'platform_tips' } as const, creditNgwee: body.tipNgwee }]
            : []),
        ],
      }),
    );
    return { ok: true };
  }
}
