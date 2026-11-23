import { StandardSchemaValidationPipe } from '@nestjs/common';
import { AppError } from './app-error.js';

/** Validates bodies declared with `@Body({ schema })`. Field problems come back keyed by field. */
export function createValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => {
      const fields: Record<string, string> = {};
      for (const issue of issues) {
        const key =
          (issue.path ?? [])
            .map((s) => (typeof s === 'object' ? String(s.key) : String(s)))
            .join('.') || '_';
        fields[key] ??= issue.message;
      }
      return new AppError('validation_failed', 400, 'Please check the form and try again.', {
        fields,
      });
    },
  });
}
