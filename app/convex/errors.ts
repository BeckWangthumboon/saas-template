import {
  type ErrorCode,
  type ErrorContextMap,
  getErrorCategoryForCode,
  throwAppErrorForConvex as throwAppErrorForConvexShared,
} from '../shared/errors';
import { logger, type LogLevel } from './logging';

interface ThrowLoggedAppErrorOptions {
  event?: string;
  level?: LogLevel;
  context?: Record<string, unknown>;
}

const ERROR_LEVEL_OVERRIDES: Partial<Record<ErrorCode, LogLevel>> = {
  AUTH_WORKOS_API_ERROR: 'error',
  INTERNAL_ERROR: 'error',
};

/**
 * Logs and throws a structured Convex application error.
 *
 * This helper centralizes backend error logging to avoid repetitive log + throw
 * callsites while preserving the typed error payload contract.
 *
 * @param code - The application error code.
 * @param context - Type-safe error context for client consumption.
 * @param options - Optional logging overrides and extra safe log context.
 * @throws ConvexError with structured AppErrorData.
 */
export const throwAppErrorForConvex = <T extends ErrorCode>(
  code: T,
  context?: ErrorContextMap[T],
  options?: ThrowLoggedAppErrorOptions,
): never => {
  const category = getErrorCategoryForCode(code);

  const level =
    options?.level ?? ERROR_LEVEL_OVERRIDES[code] ?? (category === 'INTERNAL' ? 'error' : 'warn');

  logger[level]({
    event: options?.event ?? 'app.error.thrown',
    category,
    context: {
      code,
      contextKeys: context ? Object.keys(context) : [],
      ...(options?.context ?? {}),
    },
  });

  return throwAppErrorForConvexShared(code, context);
};
