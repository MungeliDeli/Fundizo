import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CSRF_HEADER } from '@fundizo/shared';
import type { Request } from 'express';
import { AppError } from './app-error.js';

const SKIP_CSRF = 'skipCsrf';
/** For server-to-server endpoints such as payment webhooks (they authenticate differently). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence (ADR 0004): every state-changing request must carry `X-Fundizo-CSRF: 1`.
 * A cross-site page can't add a custom header without a CORS preflight, and we allow no CORS.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [ctx.getHandler(), ctx.getClass()]))
      return true;
    if (req.headers[CSRF_HEADER] === '1') return true;
    throw new AppError(
      'csrf_failed',
      403,
      'Request blocked. Please reload the page and try again.',
    );
  }
}
