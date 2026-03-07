import { ConvexError, type Value } from 'convex/values';
import { z } from 'zod';

export const ErrorCategorySchema = z.enum(['AUTH', 'WORKSPACE', 'INVITE', 'BILLING', 'INTERNAL']);

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ErrorCategory = {
  AUTH: 'AUTH',
  WORKSPACE: 'WORKSPACE',
  INVITE: 'INVITE',
  BILLING: 'BILLING',
  INTERNAL: 'INTERNAL',
} as const satisfies Record<string, ErrorCategory>;

export const ErrorCodeSchema = z.enum([
  'AUTH_UNAUTHORIZED',
  'AUTH_USER_NOT_FOUND',
  'AUTH_USER_DELETING',
  'AUTH_WORKOS_USER_NOT_FOUND',
  'AUTH_WORKOS_API_ERROR',
  'AUTH_WORKOS_RATE_LIMIT',
  'AVATAR_UPLOAD_RATE_LIMITED',
  'AVATAR_FILE_TOO_LARGE',
  'AVATAR_INVALID_FILE_TYPE',
  'AVATAR_UPLOAD_NOT_FOUND',
  'USER_LAST_OWNER_OF_WORKSPACE',
  'WORKSPACE_ACCESS_DENIED',
  'WORKSPACE_NAME_EMPTY',
  'WORKSPACE_LAST_OWNER',
  'WORKSPACE_INSUFFICIENT_ROLE',
  'WORKSPACE_MEMBER_NOT_FOUND',
  'WORKSPACE_REMOVE_SELF',
  'WORKSPACE_CREATE_RATE_LIMITED',
  'CONTACT_NAME_EMPTY',
  'CONTACT_INVALID_EMAIL',
  'CONTACT_NOT_FOUND',
  'CONTACT_WRITE_RATE_LIMITED',
  'WORKSPACE_FILE_UPLOAD_RATE_LIMITED',
  'WORKSPACE_FILE_NAME_EMPTY',
  'WORKSPACE_FILE_TOO_LARGE',
  'WORKSPACE_FILE_NOT_FOUND',
  'WORKSPACE_FILE_UPLOAD_NOT_FOUND',
  'INVITE_NOT_FOUND',
  'INVITE_EXPIRED',
  'INVITE_ALREADY_ACCEPTED',
  'INVITE_ALREADY_REVOKED',
  'INVITE_EMAIL_MISMATCH',
  'INVITE_ALREADY_MEMBER',
  'INVITE_SELF_INVITE',
  'INVITE_CANNOT_ASSIGN_OWNER',
  'INVITE_ADMIN_CANNOT_INVITE_ADMIN',
  'INVITE_CREATE_RATE_LIMITED',
  'INVITE_ACCEPT_RATE_LIMITED',
  'INVITE_EMAIL_SUPPRESSED',
  'INVITE_EMAIL_SCHEDULE_FAILED',
  'BILLING_PRODUCT_ID_REQUIRED',
  'BILLING_PRODUCT_ID_UNKNOWN',
  'BILLING_SUBSCRIPTION_STATUS_UNKNOWN',
  'BILLING_ENTITLEMENT_LIMIT_REACHED',
  'BILLING_PLAN_REQUIRED',
  'BILLING_ACCOUNT_DELETE_BLOCKED',
  'BILLING_WORKSPACE_DELETE_BLOCKED',
  'BILLING_WORKSPACE_LOCKED',
  'BILLING_WORKSPACE_STATE_MISSING',
  'BILLING_PLAN_PRODUCT_MAPPING_MISSING',
  'BILLING_CHECKOUT_CREATE_FAILED',
  'BILLING_SUBSCRIPTION_FETCH_FAILED',
  'BILLING_CUSTOMER_ID_MISSING',
  'BILLING_PORTAL_SESSION_CREATE_FAILED',
  'REQUEST_IN_FLIGHT',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorCode = {
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  AUTH_USER_DELETING: 'AUTH_USER_DELETING',
  AUTH_WORKOS_USER_NOT_FOUND: 'AUTH_WORKOS_USER_NOT_FOUND',
  AUTH_WORKOS_API_ERROR: 'AUTH_WORKOS_API_ERROR',
  AUTH_WORKOS_RATE_LIMIT: 'AUTH_WORKOS_RATE_LIMIT',
  AVATAR_UPLOAD_RATE_LIMITED: 'AVATAR_UPLOAD_RATE_LIMITED',
  AVATAR_FILE_TOO_LARGE: 'AVATAR_FILE_TOO_LARGE',
  AVATAR_INVALID_FILE_TYPE: 'AVATAR_INVALID_FILE_TYPE',
  AVATAR_UPLOAD_NOT_FOUND: 'AVATAR_UPLOAD_NOT_FOUND',
  USER_LAST_OWNER_OF_WORKSPACE: 'USER_LAST_OWNER_OF_WORKSPACE',
  WORKSPACE_ACCESS_DENIED: 'WORKSPACE_ACCESS_DENIED',
  WORKSPACE_NAME_EMPTY: 'WORKSPACE_NAME_EMPTY',
  WORKSPACE_LAST_OWNER: 'WORKSPACE_LAST_OWNER',
  WORKSPACE_INSUFFICIENT_ROLE: 'WORKSPACE_INSUFFICIENT_ROLE',
  WORKSPACE_MEMBER_NOT_FOUND: 'WORKSPACE_MEMBER_NOT_FOUND',
  WORKSPACE_REMOVE_SELF: 'WORKSPACE_REMOVE_SELF',
  WORKSPACE_CREATE_RATE_LIMITED: 'WORKSPACE_CREATE_RATE_LIMITED',
  CONTACT_NAME_EMPTY: 'CONTACT_NAME_EMPTY',
  CONTACT_INVALID_EMAIL: 'CONTACT_INVALID_EMAIL',
  CONTACT_NOT_FOUND: 'CONTACT_NOT_FOUND',
  CONTACT_WRITE_RATE_LIMITED: 'CONTACT_WRITE_RATE_LIMITED',
  WORKSPACE_FILE_UPLOAD_RATE_LIMITED: 'WORKSPACE_FILE_UPLOAD_RATE_LIMITED',
  WORKSPACE_FILE_NAME_EMPTY: 'WORKSPACE_FILE_NAME_EMPTY',
  WORKSPACE_FILE_TOO_LARGE: 'WORKSPACE_FILE_TOO_LARGE',
  WORKSPACE_FILE_NOT_FOUND: 'WORKSPACE_FILE_NOT_FOUND',
  WORKSPACE_FILE_UPLOAD_NOT_FOUND: 'WORKSPACE_FILE_UPLOAD_NOT_FOUND',
  INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_ALREADY_ACCEPTED: 'INVITE_ALREADY_ACCEPTED',
  INVITE_ALREADY_REVOKED: 'INVITE_ALREADY_REVOKED',
  INVITE_EMAIL_MISMATCH: 'INVITE_EMAIL_MISMATCH',
  INVITE_ALREADY_MEMBER: 'INVITE_ALREADY_MEMBER',
  INVITE_SELF_INVITE: 'INVITE_SELF_INVITE',
  INVITE_CANNOT_ASSIGN_OWNER: 'INVITE_CANNOT_ASSIGN_OWNER',
  INVITE_ADMIN_CANNOT_INVITE_ADMIN: 'INVITE_ADMIN_CANNOT_INVITE_ADMIN',
  INVITE_CREATE_RATE_LIMITED: 'INVITE_CREATE_RATE_LIMITED',
  INVITE_ACCEPT_RATE_LIMITED: 'INVITE_ACCEPT_RATE_LIMITED',
  INVITE_EMAIL_SUPPRESSED: 'INVITE_EMAIL_SUPPRESSED',
  INVITE_EMAIL_SCHEDULE_FAILED: 'INVITE_EMAIL_SCHEDULE_FAILED',
  BILLING_PRODUCT_ID_REQUIRED: 'BILLING_PRODUCT_ID_REQUIRED',
  BILLING_PRODUCT_ID_UNKNOWN: 'BILLING_PRODUCT_ID_UNKNOWN',
  BILLING_SUBSCRIPTION_STATUS_UNKNOWN: 'BILLING_SUBSCRIPTION_STATUS_UNKNOWN',
  BILLING_ENTITLEMENT_LIMIT_REACHED: 'BILLING_ENTITLEMENT_LIMIT_REACHED',
  BILLING_PLAN_REQUIRED: 'BILLING_PLAN_REQUIRED',
  BILLING_ACCOUNT_DELETE_BLOCKED: 'BILLING_ACCOUNT_DELETE_BLOCKED',
  BILLING_WORKSPACE_DELETE_BLOCKED: 'BILLING_WORKSPACE_DELETE_BLOCKED',
  BILLING_WORKSPACE_LOCKED: 'BILLING_WORKSPACE_LOCKED',
  BILLING_WORKSPACE_STATE_MISSING: 'BILLING_WORKSPACE_STATE_MISSING',
  BILLING_PLAN_PRODUCT_MAPPING_MISSING: 'BILLING_PLAN_PRODUCT_MAPPING_MISSING',
  BILLING_CHECKOUT_CREATE_FAILED: 'BILLING_CHECKOUT_CREATE_FAILED',
  BILLING_SUBSCRIPTION_FETCH_FAILED: 'BILLING_SUBSCRIPTION_FETCH_FAILED',
  BILLING_CUSTOMER_ID_MISSING: 'BILLING_CUSTOMER_ID_MISSING',
  BILLING_PORTAL_SESSION_CREATE_FAILED: 'BILLING_PORTAL_SESSION_CREATE_FAILED',
  REQUEST_IN_FLIGHT: 'REQUEST_IN_FLIGHT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

const errorCategoryMap: Record<ErrorCode, ErrorCategory> = {
  [ErrorCode.AUTH_UNAUTHORIZED]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_USER_NOT_FOUND]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_USER_DELETING]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_WORKOS_USER_NOT_FOUND]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_WORKOS_API_ERROR]: ErrorCategory.AUTH,
  [ErrorCode.AUTH_WORKOS_RATE_LIMIT]: ErrorCategory.AUTH,
  [ErrorCode.AVATAR_UPLOAD_RATE_LIMITED]: ErrorCategory.AUTH,
  [ErrorCode.AVATAR_FILE_TOO_LARGE]: ErrorCategory.AUTH,
  [ErrorCode.AVATAR_INVALID_FILE_TYPE]: ErrorCategory.AUTH,
  [ErrorCode.AVATAR_UPLOAD_NOT_FOUND]: ErrorCategory.AUTH,
  [ErrorCode.USER_LAST_OWNER_OF_WORKSPACE]: ErrorCategory.AUTH,
  [ErrorCode.WORKSPACE_ACCESS_DENIED]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_NAME_EMPTY]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_LAST_OWNER]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_INSUFFICIENT_ROLE]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_MEMBER_NOT_FOUND]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_REMOVE_SELF]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_CREATE_RATE_LIMITED]: ErrorCategory.WORKSPACE,
  [ErrorCode.CONTACT_NAME_EMPTY]: ErrorCategory.WORKSPACE,
  [ErrorCode.CONTACT_INVALID_EMAIL]: ErrorCategory.WORKSPACE,
  [ErrorCode.CONTACT_NOT_FOUND]: ErrorCategory.WORKSPACE,
  [ErrorCode.CONTACT_WRITE_RATE_LIMITED]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_FILE_UPLOAD_RATE_LIMITED]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_FILE_NAME_EMPTY]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_FILE_TOO_LARGE]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_FILE_NOT_FOUND]: ErrorCategory.WORKSPACE,
  [ErrorCode.WORKSPACE_FILE_UPLOAD_NOT_FOUND]: ErrorCategory.WORKSPACE,
  [ErrorCode.INVITE_NOT_FOUND]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_EXPIRED]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_ALREADY_ACCEPTED]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_ALREADY_REVOKED]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_EMAIL_MISMATCH]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_ALREADY_MEMBER]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_SELF_INVITE]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_CANNOT_ASSIGN_OWNER]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_ADMIN_CANNOT_INVITE_ADMIN]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_CREATE_RATE_LIMITED]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_ACCEPT_RATE_LIMITED]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_EMAIL_SUPPRESSED]: ErrorCategory.INVITE,
  [ErrorCode.INVITE_EMAIL_SCHEDULE_FAILED]: ErrorCategory.INVITE,
  [ErrorCode.BILLING_PRODUCT_ID_REQUIRED]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_PRODUCT_ID_UNKNOWN]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_SUBSCRIPTION_STATUS_UNKNOWN]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_ENTITLEMENT_LIMIT_REACHED]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_PLAN_REQUIRED]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_ACCOUNT_DELETE_BLOCKED]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_WORKSPACE_DELETE_BLOCKED]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_WORKSPACE_LOCKED]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_WORKSPACE_STATE_MISSING]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_PLAN_PRODUCT_MAPPING_MISSING]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_CHECKOUT_CREATE_FAILED]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_SUBSCRIPTION_FETCH_FAILED]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_CUSTOMER_ID_MISSING]: ErrorCategory.BILLING,
  [ErrorCode.BILLING_PORTAL_SESSION_CREATE_FAILED]: ErrorCategory.BILLING,
  [ErrorCode.REQUEST_IN_FLIGHT]: ErrorCategory.INTERNAL,
  [ErrorCode.INTERNAL_ERROR]: ErrorCategory.INTERNAL,
};

/**
 * Returns the category for a given application error code.
 */
export const getErrorCategoryForCode = (code: ErrorCode): ErrorCategory => {
  return errorCategoryMap[code];
};

/** Type-safe context definitions per error code */
export interface ErrorContextMap {
  [ErrorCode.AUTH_UNAUTHORIZED]: { reason?: string };
  [ErrorCode.AUTH_USER_NOT_FOUND]: { authId?: string; userId?: string };
  [ErrorCode.AUTH_USER_DELETING]: { authId?: string; userId?: string };
  [ErrorCode.AUTH_WORKOS_USER_NOT_FOUND]: { authId: string };
  [ErrorCode.AUTH_WORKOS_API_ERROR]: { operation?: string; status?: number; message?: string };
  [ErrorCode.AUTH_WORKOS_RATE_LIMIT]: { retryAfter?: number };
  [ErrorCode.AVATAR_UPLOAD_RATE_LIMITED]: { retryAfter?: number };
  [ErrorCode.AVATAR_FILE_TOO_LARGE]: { maxSizeBytes: number; actualSizeBytes?: number };
  [ErrorCode.AVATAR_INVALID_FILE_TYPE]: { contentType?: string };
  [ErrorCode.AVATAR_UPLOAD_NOT_FOUND]: { key: string };
  [ErrorCode.USER_LAST_OWNER_OF_WORKSPACE]: { workspaceNames: string[] };
  [ErrorCode.WORKSPACE_ACCESS_DENIED]: { workspaceId?: string };
  [ErrorCode.WORKSPACE_NAME_EMPTY]: Record<string, never>;
  [ErrorCode.WORKSPACE_LAST_OWNER]: { workspaceId: string };
  [ErrorCode.WORKSPACE_INSUFFICIENT_ROLE]: {
    workspaceId: string;
    requiredRole: string;
    action: string;
  };
  [ErrorCode.WORKSPACE_MEMBER_NOT_FOUND]: { userId: string; workspaceId: string };
  [ErrorCode.WORKSPACE_REMOVE_SELF]: Record<string, never>;
  [ErrorCode.WORKSPACE_CREATE_RATE_LIMITED]: { retryAfter?: number };
  [ErrorCode.CONTACT_NAME_EMPTY]: Record<string, never>;
  [ErrorCode.CONTACT_INVALID_EMAIL]: { email: string };
  [ErrorCode.CONTACT_NOT_FOUND]: { contactId: string; workspaceId: string };
  [ErrorCode.CONTACT_WRITE_RATE_LIMITED]: { retryAfter?: number; workspaceId?: string };
  [ErrorCode.WORKSPACE_FILE_UPLOAD_RATE_LIMITED]: { retryAfter?: number; workspaceId?: string };
  [ErrorCode.WORKSPACE_FILE_NAME_EMPTY]: Record<string, never>;
  [ErrorCode.WORKSPACE_FILE_TOO_LARGE]: { maxSizeBytes: number; actualSizeBytes?: number };
  [ErrorCode.WORKSPACE_FILE_NOT_FOUND]: { fileId: string; workspaceId: string };
  [ErrorCode.WORKSPACE_FILE_UPLOAD_NOT_FOUND]: { key: string; workspaceId: string };
  [ErrorCode.INVITE_NOT_FOUND]: { token?: string; inviteId?: string };
  [ErrorCode.INVITE_EXPIRED]: { token?: string; hasNewerInvite?: boolean };
  [ErrorCode.INVITE_ALREADY_ACCEPTED]: { token?: string; hasNewerInvite?: boolean };
  [ErrorCode.INVITE_ALREADY_REVOKED]: { token?: string; hasNewerInvite?: boolean };
  [ErrorCode.INVITE_EMAIL_MISMATCH]: { inviteEmail?: string; userEmail?: string };
  [ErrorCode.INVITE_ALREADY_MEMBER]: {
    email?: string;
    workspaceId?: string;
    workspaceKey?: string;
  };
  [ErrorCode.INVITE_SELF_INVITE]: Record<string, never>;
  [ErrorCode.INVITE_CANNOT_ASSIGN_OWNER]: Record<string, never>;
  [ErrorCode.INVITE_ADMIN_CANNOT_INVITE_ADMIN]: Record<string, never>;
  [ErrorCode.INVITE_CREATE_RATE_LIMITED]: { retryAfter?: number };
  [ErrorCode.INVITE_ACCEPT_RATE_LIMITED]: { retryAfter?: number };
  [ErrorCode.INVITE_EMAIL_SUPPRESSED]: {
    inviteeEmail?: string;
    reason?: 'bounce' | 'spam' | 'manual';
  };
  [ErrorCode.INVITE_EMAIL_SCHEDULE_FAILED]: { workspaceId?: string; inviteeEmail?: string };
  [ErrorCode.BILLING_PRODUCT_ID_REQUIRED]: Record<string, never>;
  [ErrorCode.BILLING_PRODUCT_ID_UNKNOWN]: { productId: string };
  [ErrorCode.BILLING_SUBSCRIPTION_STATUS_UNKNOWN]: { status: string };
  [ErrorCode.BILLING_ENTITLEMENT_LIMIT_REACHED]: {
    workspaceId: string;
    limit: 'members' | 'invites';
    currentUsage: number;
    maxAllowed: number;
  };
  [ErrorCode.BILLING_PLAN_REQUIRED]: {
    workspaceId: string;
    feature: 'team_members';
  };
  [ErrorCode.BILLING_ACCOUNT_DELETE_BLOCKED]: {
    workspaceNames: string[];
    statuses: ('trialing' | 'active' | 'past_due')[];
  };
  [ErrorCode.BILLING_WORKSPACE_DELETE_BLOCKED]: {
    workspaceId: string;
    status: 'trialing' | 'active' | 'past_due';
  };
  [ErrorCode.BILLING_WORKSPACE_LOCKED]: {
    workspaceId: string;
    graceEndsAt?: number;
  };
  [ErrorCode.BILLING_WORKSPACE_STATE_MISSING]: { workspaceId: string };
  [ErrorCode.BILLING_PLAN_PRODUCT_MAPPING_MISSING]: { planKey: string };
  [ErrorCode.BILLING_CHECKOUT_CREATE_FAILED]: { message?: string };
  [ErrorCode.BILLING_SUBSCRIPTION_FETCH_FAILED]: { subscriptionId: string; message?: string };
  [ErrorCode.BILLING_CUSTOMER_ID_MISSING]: { workspaceId: string };
  [ErrorCode.BILLING_PORTAL_SESSION_CREATE_FAILED]: { customerId: string; message?: string };
  [ErrorCode.REQUEST_IN_FLIGHT]: Record<string, never>;
  [ErrorCode.INTERNAL_ERROR]: { details?: string };
}

const errorMessages: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_UNAUTHORIZED]: 'Authentication required',
  [ErrorCode.AUTH_USER_NOT_FOUND]: 'User not found',
  [ErrorCode.AUTH_USER_DELETING]: 'This account has been deleted or is no longer available',
  [ErrorCode.AUTH_WORKOS_USER_NOT_FOUND]: 'User not found in authentication service',
  [ErrorCode.AUTH_WORKOS_API_ERROR]: 'Authentication service error',
  [ErrorCode.AUTH_WORKOS_RATE_LIMIT]: 'Too many requests',
  [ErrorCode.AVATAR_UPLOAD_RATE_LIMITED]:
    'Too many avatar upload attempts. Please try again shortly',
  [ErrorCode.AVATAR_FILE_TOO_LARGE]: 'Avatar file exceeds the allowed size',
  [ErrorCode.AVATAR_INVALID_FILE_TYPE]: 'Avatar file type is not supported',
  [ErrorCode.AVATAR_UPLOAD_NOT_FOUND]: 'Uploaded avatar file was not found',
  [ErrorCode.USER_LAST_OWNER_OF_WORKSPACE]:
    'Cannot delete account. You are the only owner of one or more workspaces',
  [ErrorCode.WORKSPACE_ACCESS_DENIED]: 'You do not have access to this workspace',
  [ErrorCode.WORKSPACE_NAME_EMPTY]: 'Workspace name cannot be empty',
  [ErrorCode.WORKSPACE_LAST_OWNER]: 'You are the only owner. Please delete the workspace instead',
  [ErrorCode.WORKSPACE_INSUFFICIENT_ROLE]:
    'You do not have the required role to perform this action',
  [ErrorCode.WORKSPACE_MEMBER_NOT_FOUND]: 'Member not found in workspace',
  [ErrorCode.WORKSPACE_REMOVE_SELF]: 'Use leave workspace instead',
  [ErrorCode.WORKSPACE_CREATE_RATE_LIMITED]:
    'Too many workspace creation attempts. Please try again shortly',
  [ErrorCode.CONTACT_NAME_EMPTY]: 'Contact name cannot be empty',
  [ErrorCode.CONTACT_INVALID_EMAIL]: 'Contact email is invalid',
  [ErrorCode.CONTACT_NOT_FOUND]: 'Contact not found',
  [ErrorCode.CONTACT_WRITE_RATE_LIMITED]: 'Too many contact updates. Please try again shortly',
  [ErrorCode.WORKSPACE_FILE_UPLOAD_RATE_LIMITED]:
    'Too many file upload attempts. Please try again shortly',
  [ErrorCode.WORKSPACE_FILE_NAME_EMPTY]: 'File name cannot be empty',
  [ErrorCode.WORKSPACE_FILE_TOO_LARGE]: 'File exceeds the allowed size',
  [ErrorCode.WORKSPACE_FILE_NOT_FOUND]: 'File not found',
  [ErrorCode.WORKSPACE_FILE_UPLOAD_NOT_FOUND]: 'Uploaded file was not found',
  [ErrorCode.INVITE_NOT_FOUND]: 'Invite not found',
  [ErrorCode.INVITE_EXPIRED]: 'This invite has expired',
  [ErrorCode.INVITE_ALREADY_ACCEPTED]: 'This invite has already been accepted',
  [ErrorCode.INVITE_ALREADY_REVOKED]: 'This invite has been revoked',
  [ErrorCode.INVITE_EMAIL_MISMATCH]: 'This invite was sent to a different email address',
  [ErrorCode.INVITE_ALREADY_MEMBER]: 'This user is already a member of the workspace',
  [ErrorCode.INVITE_SELF_INVITE]: 'You cannot invite yourself',
  [ErrorCode.INVITE_CANNOT_ASSIGN_OWNER]: 'Cannot invite with owner role',
  [ErrorCode.INVITE_ADMIN_CANNOT_INVITE_ADMIN]: 'Admins can only invite members',
  [ErrorCode.INVITE_CREATE_RATE_LIMITED]: 'Too many invitation attempts. Please try again shortly',
  [ErrorCode.INVITE_ACCEPT_RATE_LIMITED]:
    'Too many invite acceptance attempts. Please try again shortly',
  [ErrorCode.INVITE_EMAIL_SUPPRESSED]:
    'This email address cannot receive invitations due to a suppression preference',
  [ErrorCode.INVITE_EMAIL_SCHEDULE_FAILED]:
    'Failed to schedule invitation email. Please try again.',
  [ErrorCode.BILLING_PRODUCT_ID_REQUIRED]: 'Polar product ID is required',
  [ErrorCode.BILLING_PRODUCT_ID_UNKNOWN]: 'Unknown Polar product ID',
  [ErrorCode.BILLING_SUBSCRIPTION_STATUS_UNKNOWN]: 'Unknown Polar subscription status',
  [ErrorCode.BILLING_ENTITLEMENT_LIMIT_REACHED]:
    'Your workspace has reached the current plan limit',
  [ErrorCode.BILLING_PLAN_REQUIRED]: 'This feature requires a paid plan',
  [ErrorCode.BILLING_ACCOUNT_DELETE_BLOCKED]:
    'Cancel billing for your paid workspaces before deleting your account',
  [ErrorCode.BILLING_WORKSPACE_DELETE_BLOCKED]: 'Cancel billing before deleting this workspace',
  [ErrorCode.BILLING_WORKSPACE_LOCKED]:
    'Workspace access is temporarily restricted due to billing issues',
  [ErrorCode.BILLING_WORKSPACE_STATE_MISSING]: 'Workspace billing state is missing',
  [ErrorCode.BILLING_PLAN_PRODUCT_MAPPING_MISSING]: 'Missing Polar product mapping for plan',
  [ErrorCode.BILLING_CHECKOUT_CREATE_FAILED]: 'Failed to create checkout session',
  [ErrorCode.BILLING_SUBSCRIPTION_FETCH_FAILED]: 'Failed to fetch subscription',
  [ErrorCode.BILLING_CUSTOMER_ID_MISSING]: 'Missing customer ID for billing portal session',
  [ErrorCode.BILLING_PORTAL_SESSION_CREATE_FAILED]: 'Failed to create customer portal session',
  [ErrorCode.REQUEST_IN_FLIGHT]: 'Request already in flight',
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

const CONVEX_ERROR_SYMBOL = Symbol.for('ConvexError');

const isConvexError = (error: unknown): error is ConvexError<Value> => {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  if (name !== 'ConvexError') return false;
  if (!('data' in error)) return false;
  return CONVEX_ERROR_SYMBOL in error;
};

const parseConvexError = (error: ConvexError<Value>): AppErrorData | null => {
  const parsed = AppErrorDataSchema.safeParse(error.data);
  return parsed.success ? (parsed.data as AppErrorData) : null;
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
  if (isConvexError(error)) {
    return parseConvexError(error);
  }

  if (error && typeof error === 'object' && 'cause' in error) {
    const { cause } = error as { cause?: unknown };
    if (isConvexError(cause)) {
      return parseConvexError(cause);
    }
  }

  return null;
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
    avatarUploadRateLimited: (retryAfter?: number) =>
      createAppErrorForConvex(
        ErrorCode.AVATAR_UPLOAD_RATE_LIMITED,
        retryAfter ? { retryAfter } : undefined,
      ),
    avatarFileTooLarge: (context: ErrorContextMap['AVATAR_FILE_TOO_LARGE']) =>
      createAppErrorForConvex(ErrorCode.AVATAR_FILE_TOO_LARGE, context),
    avatarInvalidFileType: (context?: ErrorContextMap['AVATAR_INVALID_FILE_TYPE']) =>
      createAppErrorForConvex(ErrorCode.AVATAR_INVALID_FILE_TYPE, context),
    avatarUploadNotFound: (key: string) =>
      createAppErrorForConvex(ErrorCode.AVATAR_UPLOAD_NOT_FOUND, { key }),
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
    memberNotFound: (userId: string, workspaceId: string) =>
      createAppErrorForConvex(ErrorCode.WORKSPACE_MEMBER_NOT_FOUND, { userId, workspaceId }),
    removeSelf: () => createAppErrorForConvex(ErrorCode.WORKSPACE_REMOVE_SELF),
    createRateLimited: (retryAfter?: number) =>
      createAppErrorForConvex(
        ErrorCode.WORKSPACE_CREATE_RATE_LIMITED,
        retryAfter ? { retryAfter } : undefined,
      ),
    contactNameEmpty: () => createAppErrorForConvex(ErrorCode.CONTACT_NAME_EMPTY),
    contactInvalidEmail: (email: string) =>
      createAppErrorForConvex(ErrorCode.CONTACT_INVALID_EMAIL, { email }),
    contactNotFound: (contactId: string, workspaceId: string) =>
      createAppErrorForConvex(ErrorCode.CONTACT_NOT_FOUND, { contactId, workspaceId }),
    contactWriteRateLimited: (context?: ErrorContextMap['CONTACT_WRITE_RATE_LIMITED']) =>
      createAppErrorForConvex(ErrorCode.CONTACT_WRITE_RATE_LIMITED, context),
    fileUploadRateLimited: (context?: ErrorContextMap['WORKSPACE_FILE_UPLOAD_RATE_LIMITED']) =>
      createAppErrorForConvex(ErrorCode.WORKSPACE_FILE_UPLOAD_RATE_LIMITED, context),
    fileNameEmpty: () => createAppErrorForConvex(ErrorCode.WORKSPACE_FILE_NAME_EMPTY),
    fileTooLarge: (context: ErrorContextMap['WORKSPACE_FILE_TOO_LARGE']) =>
      createAppErrorForConvex(ErrorCode.WORKSPACE_FILE_TOO_LARGE, context),
    fileNotFound: (fileId: string, workspaceId: string) =>
      createAppErrorForConvex(ErrorCode.WORKSPACE_FILE_NOT_FOUND, { fileId, workspaceId }),
    fileUploadNotFound: (key: string, workspaceId: string) =>
      createAppErrorForConvex(ErrorCode.WORKSPACE_FILE_UPLOAD_NOT_FOUND, { key, workspaceId }),
  },
  invite: {
    notFound: (context?: ErrorContextMap['INVITE_NOT_FOUND']) =>
      createAppErrorForConvex(ErrorCode.INVITE_NOT_FOUND, context),
    expired: (token?: string) =>
      createAppErrorForConvex(ErrorCode.INVITE_EXPIRED, token ? { token } : undefined),
    alreadyAccepted: (token?: string) =>
      createAppErrorForConvex(ErrorCode.INVITE_ALREADY_ACCEPTED, token ? { token } : undefined),
    alreadyRevoked: (token?: string) =>
      createAppErrorForConvex(ErrorCode.INVITE_ALREADY_REVOKED, token ? { token } : undefined),
    emailMismatch: (context?: ErrorContextMap['INVITE_EMAIL_MISMATCH']) =>
      createAppErrorForConvex(ErrorCode.INVITE_EMAIL_MISMATCH, context),
    alreadyMember: (context?: ErrorContextMap['INVITE_ALREADY_MEMBER']) =>
      createAppErrorForConvex(ErrorCode.INVITE_ALREADY_MEMBER, context),
    selfInvite: () => createAppErrorForConvex(ErrorCode.INVITE_SELF_INVITE),
    cannotAssignOwner: () => createAppErrorForConvex(ErrorCode.INVITE_CANNOT_ASSIGN_OWNER),
    adminCannotInviteAdmin: () =>
      createAppErrorForConvex(ErrorCode.INVITE_ADMIN_CANNOT_INVITE_ADMIN),
    createRateLimited: (retryAfter?: number) =>
      createAppErrorForConvex(
        ErrorCode.INVITE_CREATE_RATE_LIMITED,
        retryAfter ? { retryAfter } : undefined,
      ),
    acceptRateLimited: (retryAfter?: number) =>
      createAppErrorForConvex(
        ErrorCode.INVITE_ACCEPT_RATE_LIMITED,
        retryAfter ? { retryAfter } : undefined,
      ),
    emailSuppressed: (context?: ErrorContextMap['INVITE_EMAIL_SUPPRESSED']) =>
      createAppErrorForConvex(ErrorCode.INVITE_EMAIL_SUPPRESSED, context),
    emailScheduleFailed: (context?: ErrorContextMap['INVITE_EMAIL_SCHEDULE_FAILED']) =>
      createAppErrorForConvex(ErrorCode.INVITE_EMAIL_SCHEDULE_FAILED, context),
  },
  billing: {
    productIdRequired: () => createAppErrorForConvex(ErrorCode.BILLING_PRODUCT_ID_REQUIRED),
    productIdUnknown: (productId: string) =>
      createAppErrorForConvex(ErrorCode.BILLING_PRODUCT_ID_UNKNOWN, { productId }),
    subscriptionStatusUnknown: (status: string) =>
      createAppErrorForConvex(ErrorCode.BILLING_SUBSCRIPTION_STATUS_UNKNOWN, { status }),
    accountDeleteBlocked: (context: ErrorContextMap['BILLING_ACCOUNT_DELETE_BLOCKED']) =>
      createAppErrorForConvex(ErrorCode.BILLING_ACCOUNT_DELETE_BLOCKED, context),
    workspaceDeleteBlocked: (context: ErrorContextMap['BILLING_WORKSPACE_DELETE_BLOCKED']) =>
      createAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_DELETE_BLOCKED, context),
    workspaceStateMissing: (workspaceId: string) =>
      createAppErrorForConvex(ErrorCode.BILLING_WORKSPACE_STATE_MISSING, { workspaceId }),
    planProductMappingMissing: (planKey: string) =>
      createAppErrorForConvex(ErrorCode.BILLING_PLAN_PRODUCT_MAPPING_MISSING, { planKey }),
    checkoutCreateFailed: (message?: string) =>
      createAppErrorForConvex(
        ErrorCode.BILLING_CHECKOUT_CREATE_FAILED,
        message ? { message } : undefined,
      ),
    subscriptionFetchFailed: (subscriptionId: string, message?: string) =>
      createAppErrorForConvex(
        ErrorCode.BILLING_SUBSCRIPTION_FETCH_FAILED,
        message ? { subscriptionId, message } : { subscriptionId },
      ),
    customerIdMissing: (workspaceId: string) =>
      createAppErrorForConvex(ErrorCode.BILLING_CUSTOMER_ID_MISSING, { workspaceId }),
    portalSessionCreateFailed: (customerId: string, message?: string) =>
      createAppErrorForConvex(
        ErrorCode.BILLING_PORTAL_SESSION_CREATE_FAILED,
        message ? { customerId, message } : { customerId },
      ),
  },
  internal: {
    error: (details?: string) =>
      createAppErrorForConvex(ErrorCode.INTERNAL_ERROR, details ? { details } : undefined),
  },
};
