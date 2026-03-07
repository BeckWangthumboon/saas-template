import type { AppErrorData } from '@saas/shared/errors';

export function getRetryAfterSeconds(error: AppErrorData): number | undefined {
  const context = error.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return undefined;
  }

  const retryAfter = (context as Record<string, unknown>).retryAfter;

  if (typeof retryAfter !== 'number' || !Number.isFinite(retryAfter) || retryAfter <= 0) {
    return undefined;
  }

  return Math.ceil(retryAfter);
}

export function formatRetryAfterDescription(
  retryAfter?: number,
  fallback = 'Please wait a moment before trying again.',
): string {
  if (!retryAfter) {
    return fallback;
  }

  if (retryAfter < 60) {
    return `Please try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(retryAfter / 60);
  return `Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
