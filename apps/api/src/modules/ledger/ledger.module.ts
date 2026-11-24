import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service.js';

/**
 * Ledger (F-06). Other modules import this module and call `LedgerService` only; the ledger tables
 * are off-limits to them (CLAUDE.md, module boundaries).
 */
@Module({ providers: [LedgerService], exports: [LedgerService] })
export class LedgerModule {}
