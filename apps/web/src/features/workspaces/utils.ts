import { format } from 'date-fns';

import type { Role } from './types';

/**
 * Generates initials from a user's name or email.
 * Uses first letters of first and last name if available,
 * otherwise falls back to first letter of first name or email.
 */
export function getInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName[0].toUpperCase();
  }
  return email[0].toUpperCase();
}

/**
 * Formats a user's full name from first and last name parts.
 * Returns empty string if neither name is available.
 */
export function formatName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  return firstName ?? lastName ?? '';
}

/**
 * Formats a timestamp into a human-readable date string.
 * Example output: "Jan 15, 2024"
 */
export function formatDate(timestamp: number): string {
  return format(new Date(timestamp), 'MMM d, yyyy');
}

/**
 * Builds a full invite URL for a token.
 * Falls back to a relative path when window is unavailable.
 */
export function formatInviteLink(token: string, origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  const path = `/invite/${token}`;

  if (!base) return path;

  return new URL(path, base).toString();
}

/**
 * Returns the appropriate badge variant for a workspace role.
 * - owner: default (primary)
 * - admin: secondary
 * - member: outline
 */
export function getRoleBadgeVariant(role: Role): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'owner':
      return 'default';
    case 'admin':
      return 'secondary';
    default:
      return 'outline';
  }
}
