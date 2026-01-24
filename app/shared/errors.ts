import { ConvexError, type Value } from 'convex/values';
import { z } from 'zod';

export const ErrorCategorySchema = z.enum(['AUTH', 'WORKSPACE', 'INTERNAL']);

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ErrorCategory = {
  AUTH: 'AUTH',
  WORKSPACE: 'WORKSPACE',
  INTERNAL: 'INTERNAL',
} as const satisfies Record<string, ErrorCategory>;

export const ErrorCodeSchema = z.enum([
  'AUTH_UNAUTHORIZED',
  'AUTH_USER_NOT_FOUND',
  'AUTH_WORKOS_USER_NOT_FOUND',
  'AUTH_WORKOS_API_ERROR',
  'AUTH_WORKOS_RATE_LIMIT',
  'WORKSPACE_ACCESS_DENIED',
  'WORKSPACE_NAME_EMPTY',
  'WORKSPACE_LAST_OWNER',
  'WORKSPACE_INSUFFICIENT_ROLE',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorCode = {
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_WORKOS_USER_NOT_FOUND: 'AUTH_WORKOS_USER_NOT_FOUND',
  AUTH_WORKOS_API_ERROR: 'AUTH_WORKOS_API_ERROR',
  AUTH_WORKOS_RATE_LIMIT: 'AUTH_WORKOS_RATE_LIMIT',
  WORKSPACE_ACCESS_DENIED: 'WORKSPACE_ACCESS_DENIED',
  WORKSPACE_NAME_EMPTY: 'WORKSPACE_NAME_EMPTY',
  WORKSPACE_LAST_OWNER: 'WORKSPACE_LAST_OWNER',
  WORKSPACE_INSUFFICIENT_ROLE: 'WORKSPACE_INSUFFICIENT_ROLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

const errorCategoryMap: Record<ErrorCode, ErrorCategory> = {
  [ErrorCode.AUTH_UNAUTHORIZED]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_USER_NOT_FOUND]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_WORKOS_USER_NOT_FOUND]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_WORKOS_API_ERROR]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_WORKOS_RATE_LIMIT]: ErrorCategory.AUTH,
  [ErrorCode.WORKSPACE_ACCESS_DENIED]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_NAME_EMPTY]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_LAST_OWNER]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_INSUFFICIENT_ROLE]: ErrorCategory.WORKSPACE,
  [ErrorCode.INTERNAL_ERROR]: ErrorCategory.INTERNAL,
};

/** Type-safe context definitions per error code */
export interface ErrorContextMap {
  [ErrorCode.AUTH_UNAUTHORIZED]: { reason?: string };
  [ErrorCode.AUTH_USER_NOT_FOUND]: { authId?: string; userId?: string };
  [ErrorCode.AUTH_WORKOS_USER_NOT_FOUND]: { authId: string };
  [ErrorCode.AUTH_WORKOS_API_ERROR]: { operation?: string; status?: number; message?: string };
  [ErrorCode.AUTH_WORKOS_RATE_LIMIT]: { retryAfter?: number };
  [ErrorCode.WORKSPACE_ACCESS_DENIED]: { workspaceId?: string };
  [ErrorCode.WORKSPACE_NAME_EMPTY]: Record<string, never>;
  [ErrorCode.WORKSPACE_LAST_OWNER]: { workspaceId: string };
  [ErrorCode.WORKSPACE_INSUFFICIENT_ROLE]: { workspaceId: string; requiredRole: string; action: string };
  [ErrorCode.INTERNAL_ERROR]: { details?: string };
}

const errorMessages: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_UNAUTHORIZED]: 'Authentication required',
  [ErrorCode.AUTH_USER_NOT_FOUND]: 'User not found',
  [ErrorCode.AUTH_WORKOS_USER_NOT_FOUND]: 'User not found in authentication service',
  [ErrorCode.AUTH_WORKOS_API_ERROR]: 'Authentication service error',
  [ErrorCode.AUTH_WORKOS_RATE_LIMIT]: 'Too many requests',
  [ErrorCode.WORKSPACE_ACCESS_DENIED]: 'You do not have access to this workspace',
  [ErrorCode.WORKSPACE_NAME_EMPTY]: 'Workspace name cannot be empty',
  [ErrorCode.WORKSPACE_LAST_OWNER]: 'You are the only owner. Please delete the workspace instead',
  [ErrorCode.WORKSPACE_INSUFFICIENT_ROLE]: 'You do not have the required role to perform this action',
  [ErrorCode.INTERNAL_ERROR]: 'Internal error',
};

export type AppErrorData<T extends ErrorCode = ErrorCode> = {
  code: T;
  category: ErrorCategory;
  message: string;
  context?: ErrorContextMap[T];
  timestamp: string;
} & Record<string, Value | undefined>;

export const AppErrorDataSchema = z.object({
  code: ErrorCodeSchema,
  category: ErrorCategorySchema,
  message: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string(),
});

const buildAppErrorData = <T extends ErrorCode>(
  code: T,
  context?: ErrorContextMap[T],
): AppErrorData<T> => ({
  code,
  category: errorCategoryMap[code],
  message: errorMessages[code],
  context,
  timestamp: new Date().toISOString(),
});

/**
 * Creates a ConvexError with structured app error data.
 * For use in Convex backend functions (queries, mutations, actions).
 *
 * @param code - The error code
 * @param context - Type-safe context data for the error
 * @returns ConvexError instance (does not throw)
 */
export const createAppErrorForConvex = <T extends ErrorCode>(
  code: T,
  context?: ErrorContextMap[T],
) => new ConvexError<AppErrorData<T>>(buildAppErrorData(code, context));

/**
 * Creates and throws a ConvexError with structured app error data.
 * For use in Convex backend functions (queries, mutations, actions).
 *
 * @param code - The error code
 * @param context - Type-safe context data for the error
 * @throws ConvexError with structured AppErrorData
 */
export const throwAppErrorForConvex = <T extends ErrorCode>(
  code: T,
  context?: ErrorContextMap[T],
): never => {
  throw createAppErrorForConvex(code, context);
};

/**
 * Parses a caught error to extract structured AppErrorData.
 * For use on the frontend when catching errors from Convex functions.
 *
 * @param error - The caught error (unknown type)
 * @returns Parsed AppErrorData if valid, null otherwise
 *
 * @example
 * ```ts
 * try {
 *   await updateName({ firstName: 'John' });
 * } catch (error: unknown) {
 *   const appError = parseAppError(error);
 *   if (appError) {
 *     toast.error(appError.message);
 *   }
 * }
 * ```
 */
export const parseAppError = (error: unknown): AppErrorData | null => {
  if (!(error instanceof ConvexError)) return null;
  const parsed = AppErrorDataSchema.safeParse(error.data);
  return parsed.success ? (parsed.data as AppErrorData) : null;
};

/**
 * Factory functions for creating Convex backend errors.
 * Use these in Convex queries, mutations, and actions.
 * Organized by error category (auth, internal).
 *
 * @example
 * ```ts
 * // In a Convex function:
 * throw ConvexErrors.auth.unauthorized({ reason: 'no_identity' });
 * throw ConvexErrors.auth.userNotFound({ authId: 'user_123' });
 * throw ConvexErrors.internal.error({ details: 'Database error' });
 * ```
 */
export const ConvexErrors = {
  auth: {
    unauthorized: (context?: ErrorContextMap['AUTH_UNAUTHORIZED']) =>
      createAppErrorForConvex(ErrorCode.AUTH_UNAUTHORIZED, context),
    userNotFound: (context?: ErrorContextMap['AUTH_USER_NOT_FOUND']) =>
      createAppErrorForConvex(ErrorCode.AUTH_USER_NOT_FOUND, context),
    workosUserNotFound: (authId: string) =>
      createAppErrorForConvex(ErrorCode.AUTH_WORKOS_USER_NOT_FOUND, { authId }),
    workosError: (context?: ErrorContextMap['AUTH_WORKOS_API_ERROR']) =>
      createAppErrorForConvex(ErrorCode.AUTH_WORKOS_API_ERROR, context),
    rateLimit: (retryAfter?: number) =>
      createAppErrorForConvex(
        ErrorCode.AUTH_WORKOS_RATE_LIMIT,
        retryAfter ? { retryAfter } : undefined,
      ),
  },
  workspace: {
    accessDenied: (workspaceId?: string) =>
      createAppErrorForConvex(
        ErrorCode.WORKSPACE_ACCESS_DENIED,
        workspaceId ? { workspaceId } : undefined,
      ),
    nameEmpty: () => createAppErrorForConvex(ErrorCode.WORKSPACE_NAME_EMPTY),
    lastOwner: (workspaceId: string) =>
      createAppErrorForConvex(ErrorCode.WORKSPACE_LAST_OWNER, { workspaceId }),
    insufficientRole: (context: ErrorContextMap['WORKSPACE_INSUFFICIENT_ROLE']) =>
      createAppErrorForConvex(ErrorCode.WORKSPACE_INSUFFICIENT_ROLE, context),
  },
  internal: {
    error: (details?: string) =>
      createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, details ? { details } : undefined),
  },
};
