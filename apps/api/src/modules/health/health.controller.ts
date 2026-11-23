import { Controller, Get, Res } from '@nestjs/common';
import type { HealthResponse } from '@fundizo/shared';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

/**
 * Liveness + dependency check. Used by the load balancer (ECS) and the web app's status pill.
 * Returns 503 when a dependency is down so the load balancer stops sending traffic.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async get(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const result = await this.health.check();
    res.status(result.status === 'ok' ? 200 : 503);
    res.setHeader('Cache-Control', 'no-store');
    return result;
  }
}
