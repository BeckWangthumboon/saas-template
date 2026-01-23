import { z } from 'zod';

export const ErrorCategorySchema = z.enum([
  'AUTH',
  'VALIDATION',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMIT',
  'EXTERNAL',
  'INTERNAL',
]);

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ErrorCategory = {
  AUTH: 'AUTH',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  EXTERNAL: 'EXTERNAL',
  INTERNAL: 'INTERNAL',
} as const satisfies Record<string, ErrorCategory>;

export const ErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'INSUFFICIENT_PERMISSIONS',
  'USER_NOT_FOUND',
  'RESOURCE_NOT_FOUND',
  'WORKSPACE_NOT_FOUND',
  'WORKOS_API_ERROR',
  'WORKOS_USER_NOT_FOUND',
  'INVALID_INPUT',
  'MISSING_REQUIRED_FIELD',
  'TOO_MANY_REQUESTS',
  'ALREADY_EXISTS',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKOS_API_ERROR: 'WORKOS_API_ERROR',
  WORKOS_USER_NOT_FOUND: 'WORKOS_USER_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** Maps error codes to their categories */
const errorCategoryMap: Record<ErrorCode, ErrorCategory> = {
  [ErrorCode.UNAUTHORIZED]: ErrorCategory.AUTH,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: ErrorCategory.AUTH,
  [ErrorCode.USER_NOT_FOUND]: ErrorCategory.NOT_FOUND,
  [ErrorCode.RESOURCE_NOT_FOUND]: ErrorCategory.NOT_FOUND,
  [ErrorCode.WORKSPACE_NOT_FOUND]: ErrorCategory.NOT_FOUND,
  [ErrorCode.WORKOS_API_ERROR]: ErrorCategory.EXTERNAL,
  [ErrorCode.WORKOS_USER_NOT_FOUND]: ErrorCategory.EXTERNAL,
  [ErrorCode.INVALID_INPUT]: ErrorCategory.VALIDATION,
  [ErrorCode.MISSING_REQUIRED_FIELD]: ErrorCategory.VALIDATION,
  [ErrorCode.TOO_MANY_REQUESTS]: ErrorCategory.RATE_LIMIT,
  [ErrorCode.ALREADY_EXISTS]: ErrorCategory.CONFLICT,
  [ErrorCode.INTERNAL_ERROR]: ErrorCategory.INTERNAL,
};

/** Type-safe context definitions per error code */
export interface ErrorContextMap {
  [ErrorCode.UNAUTHORIZED]: { reason?: string };
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: { required?: string; resource?: string };
  [ErrorCode.USER_NOT_FOUND]: { authId?: string; userId?: string };
  [ErrorCode.RESOURCE_NOT_FOUND]: { resourceType?: string; resourceId?: string };
  [ErrorCode.WORKSPACE_NOT_FOUND]: { workspaceId?: string };
  [ErrorCode.WORKOS_API_ERROR]: { operation?: string; status?: number; message?: string };
  [ErrorCode.WORKOS_USER_NOT_FOUND]: { authId: string };
  [ErrorCode.INVALID_INPUT]: { field?: string; message?: string };
  [ErrorCode.MISSING_REQUIRED_FIELD]: { field: string };
  [ErrorCode.TOO_MANY_REQUESTS]: { retryAfter?: number };
  [ErrorCode.ALREADY_EXISTS]: { resourceType?: string; identifier?: string };
  [ErrorCode.INTERNAL_ERROR]: { details?: string };
}

/** Human-readable messages for each error code */
const errorMessages: Record<ErrorCode, string> = {
  [ErrorCode.UNAUTHORIZED]: 'Authentication required',
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions',
  [ErrorCode.USER_NOT_FOUND]: 'User not found',
  [ErrorCode.RESOURCE_NOT_FOUND]: 'Resource not found',
  [ErrorCode.WORKSPACE_NOT_FOUND]: 'Workspace not found',
  [ErrorCode.WORKOS_API_ERROR]: 'Authentication service error',
  [ErrorCode.WORKOS_USER_NOT_FOUND]: 'User not found in authentication service',
  [ErrorCode.INVALID_INPUT]: 'Invalid input',
  [ErrorCode.MISSING_REQUIRED_FIELD]: 'Missing required field',
  [ErrorCode.TOO_MANY_REQUESTS]: 'Too many requests',
  [ErrorCode.ALREADY_EXISTS]: 'Resource already exists',
  [ErrorCode.INTERNAL_ERROR]: 'Internal error',
};

export const APP_ERROR_PREFIX = '[APP_ERROR]';

export const SerializedErrorSchema = z.object({
  code: ErrorCodeSchema,
  category: ErrorCategorySchema,
  message: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string(),
});

export type SerializedError = z.infer<typeof SerializedErrorSchema>;

/**
 * Structured application error that serializes to JSON for Convex transport.
 *
 * @example
 * ```ts
 * // Backend:
 * throw new AppError('UNAUTHORIZED', { reason: 'no_identity' });
 *
 * // Frontend:
 * const parsed = AppError.parse(error.message);
 * if (parsed?.code === 'UNAUTHORIZED') { ... }
 * ```
 */
export class AppError<T extends ErrorCode = ErrorCode> extends Error {
  public readonly code: T;
  public readonly category: ErrorCategory;
  public readonly context?: ErrorContextMap[T];
  public readonly timestamp: string;

  constructor(code: T, context?: ErrorContextMap[T]) {
    const serialized: SerializedError = {
      code,
      category: errorCategoryMap[code],
      message: errorMessages[code],
      context: context as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };

    super(`${APP_ERROR_PREFIX}${JSON.stringify(serialized)}`);

    this.name = 'AppError';
    this.code = code;
    this.category = errorCategoryMap[code];
    this.context = context;
    this.timestamp = serialized.timestamp;
  }

  /**
   * Parse a structured error from an error message string.
   * Uses Zod for runtime validation of the error shape.
   * Returns null if the message is not a valid structured app error.
   */
  static parse(message: string): SerializedError | null {
    if (!message.startsWith(APP_ERROR_PREFIX)) {
      return null;
    }

    try {
      const jsonStr = message.slice(APP_ERROR_PREFIX.length);
      return SerializedErrorSchema.parse(JSON.parse(jsonStr));
    } catch {
      return null;
    }
  }

  /**
   * Check if an error is a structured AppError by examining its message.
   */
  static isAppError(error: unknown): error is Error & { message: string } {
    return (
      error instanceof Error &&
      typeof error.message === 'string' &&
      error.message.startsWith(APP_ERROR_PREFIX)
    );
  }
}

/**
 * Factory functions for creating typed errors.
 *
 * @example
 * ```ts
 * import { Errors } from '@/shared/errors';
 *
 * throw Errors.unauthorized({ reason: 'no_identity' });
 * throw Errors.userNotFound({ authId: 'user_123' });
 * throw Errors.workosError({ operation: 'getUser', status: 500 });
 * ```
 */
export const Errors = {
  unauthorized: (context?: ErrorContextMap['UNAUTHORIZED']) =>
    new AppError(ErrorCode.UNAUTHORIZED, context),

  insufficientPermissions: (context?: ErrorContextMap['INSUFFICIENT_PERMISSIONS']) =>
    new AppError(ErrorCode.INSUFFICIENT_PERMISSIONS, context),

  userNotFound: (context?: ErrorContextMap['USER_NOT_FOUND']) =>
    new AppError(ErrorCode.USER_NOT_FOUND, context),

  resourceNotFound: (context?: ErrorContextMap['RESOURCE_NOT_FOUND']) =>
    new AppError(ErrorCode.RESOURCE_NOT_FOUND, context),

  workspaceNotFound: (context?: ErrorContextMap['WORKSPACE_NOT_FOUND']) =>
    new AppError(ErrorCode.WORKSPACE_NOT_FOUND, context),

  workosError: (context?: ErrorContextMap['WORKOS_API_ERROR']) =>
    new AppError(ErrorCode.WORKOS_API_ERROR, context),

  workosUserNotFound: (authId: string) => new AppError(ErrorCode.WORKOS_USER_NOT_FOUND, { authId }),

  invalidInput: (context?: ErrorContextMap['INVALID_INPUT']) =>
    new AppError(ErrorCode.INVALID_INPUT, context),

  missingRequiredField: (field: string) =>
    new AppError(ErrorCode.MISSING_REQUIRED_FIELD, { field }),

  rateLimit: (retryAfter?: number) =>
    new AppError(ErrorCode.TOO_MANY_REQUESTS, retryAfter ? { retryAfter } : undefined),

  alreadyExists: (context?: ErrorContextMap['ALREADY_EXISTS']) =>
    new AppError(ErrorCode.ALREADY_EXISTS, context),

  internal: (details?: string) =>
    new AppError(ErrorCode.INTERNAL_ERROR, details ? { details } : undefined),
};
