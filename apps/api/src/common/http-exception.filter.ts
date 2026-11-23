import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody } from '@fundizo/shared';
import type { Response } from 'express';
import { AppError } from './app-error.js';

/** Every error leaves the API in one shape: `{ error: { code, message, fields?, retryAfter? } }`. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (body.error.retryAfter) res.setHeader('Retry-After', String(body.error.retryAfter));
    res.status(status).json(body);
  }

  private toBody(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: { error: { code: exception.code, message: exception.message, ...exception.extra } },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404)
        return { status, body: { error: { code: 'not_found', message: 'Not found.' } } };
      if (status < 500) {
        return {
          status,
          body: {
            error: { code: 'validation_failed', message: 'Please check the form and try again.' },
          },
        };
      }
    }
    // Unexpected: log it fully, tell the client nothing internal.
    this.logger.error(exception instanceof Error ? exception : { exception }, 'unhandled error');
    return {
      status: 500,
      body: {
        error: {
          code: 'internal_error',
          message: 'Something went wrong on our side. Please try again.',
        },
      },
    };
  }
}
