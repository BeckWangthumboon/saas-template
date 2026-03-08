import { ErrorCode } from '@saas/shared/errors';
import type { Infer } from 'convex/values';
import { v } from 'convex/values';
import { z } from 'zod';

import type { Doc, Id } from '../_generated/dataModel';
import { throwAppErrorForConvex } from '../errors';
import { mutation, type MutationCtx, query } from '../functions';
import { logger } from '../logging';
import { rateLimiter } from '../rateLimiter';
import { getWorkspaceMembership } from '../workspaces/utils';

const emailValidator = z.email();
const contactInputArgs = {
  name: v.string(),
  email: v.optional(v.string()),
  notes: v.optional(v.string()),
};
const _contactInputValidator = v.object(contactInputArgs);

type ContactInput = Infer<typeof _contactInputValidator>;
type ContactWriteFields = Pick<Doc<'contacts'>, 'name' | 'email' | 'notes'>;

/**
 * Normalizes optional text input into `undefined` when blank.
 */
function normalizeOptionalText(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validates and normalizes contact input for create/update operations.
 */
function normalizeAndValidateContactInput(input: ContactInput) {
  const name = input.name.trim();
  const email = normalizeOptionalText(input.email)?.toLowerCase();
  const notes = normalizeOptionalText(input.notes);

  if (!name) {
    return throwAppErrorForConvex(ErrorCode.CONTACT_NAME_EMPTY);
  }

  if (email && !emailValidator.safeParse(email).success) {
    return throwAppErrorForConvex(ErrorCode.CONTACT_INVALID_EMAIL, {
      email,
    });
  }

  const normalizedInput: ContactWriteFields = {
    name,
    email,
    notes,
  };

  return normalizedInput;
}

/**
 * Loads a contact and validates that it belongs to the requested workspace.
 */
async function getContactForWorkspace(
  ctx: MutationCtx,
  contactId: Id<'contacts'>,
  workspaceId: Id<'workspaces'>,
) {
  const contact = await ctx.db.get('contacts', contactId);

  if (contact?.workspaceId !== workspaceId) {
    return throwAppErrorForConvex(ErrorCode.CONTACT_NOT_FOUND, {
      contactId: contactId as string,
      workspaceId: workspaceId as string,
    });
  }

  return contact;
}

/**
 * Enforces per-actor contact write throughput limits.
 *
 * @param ctx - The mutation context.
 * @param workspaceId - The workspace where the write is occurring.
 * @param userId - The authenticated actor performing the write.
 * @throws CONTACT_WRITE_RATE_LIMITED when the actor exceeds write throughput.
 */
async function assertContactWriteRateLimit(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
) {
  const status = await rateLimiter.limit(ctx, 'mutateContactsByActor', {
    key: `${workspaceId}:${userId}`,
  });

  if (status.ok) {
    return;
  }

  logger.warn({
    event: 'contacts.write_rate_limited',
    category: 'WORKSPACE',
    context: {
      workspaceId,
      userId,
      retryAfter: status.retryAfter,
    },
  });

  return throwAppErrorForConvex(ErrorCode.CONTACT_WRITE_RATE_LIMITED, {
    workspaceId: workspaceId as string,
    retryAfter: status.retryAfter,
  });
}

/**
 * Lists all contacts for a workspace.
 *
 * @param workspaceId - The workspace to list contacts for.
 * @returns Contacts sorted by most recently updated first.
 * @throws WORKSPACE_ACCESS_DENIED when caller is not a workspace member.
 */
export const listContacts = query({
  args: { workspaceId: v.id('workspaces') },
  handler: async (ctx, args) => {
    await getWorkspaceMembership(ctx, args.workspaceId);

    const contacts = await ctx.db
      .query('contacts')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', args.workspaceId))
      .collect();

    return contacts.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * Creates a contact in the workspace.
 *
 * @param workspaceId - Target workspace.
 * @param name - Contact name.
 * @param email - Optional contact email.
 * @param notes - Optional notes.
 * @returns The created contact ID.
 * @throws WORKSPACE_ACCESS_DENIED when caller is not a workspace member.
 * @throws CONTACT_NAME_EMPTY when name is blank.
 * @throws CONTACT_INVALID_EMAIL when email format is invalid.
 * @throws CONTACT_WRITE_RATE_LIMITED when write throughput limits are exceeded.
 */
export const createContact = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    ...contactInputArgs,
  },
  handler: async (ctx, args) => {
    const { user } = await getWorkspaceMembership(ctx, args.workspaceId);
    await assertContactWriteRateLimit(ctx, args.workspaceId, user._id);
    const normalizedInput = normalizeAndValidateContactInput(args);
    const now = Date.now();

    const contactId = await ctx.db.insert('contacts', {
      workspaceId: args.workspaceId,
      name: normalizedInput.name,
      email: normalizedInput.email,
      notes: normalizedInput.notes,
      createdByUserId: user._id,
      updatedAt: now,
    });

    logger.info({
      event: 'contacts.created',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        contactId,
        createdByUserId: user._id,
      },
    });

    return contactId;
  },
});

/**
 * Updates an existing contact.
 *
 * @param workspaceId - Target workspace.
 * @param contactId - Contact to update.
 * @param name - Contact name.
 * @param email - Optional contact email.
 * @param notes - Optional notes.
 * @throws WORKSPACE_ACCESS_DENIED when caller is not a workspace member.
 * @throws CONTACT_NOT_FOUND when contact does not exist in workspace.
 * @throws CONTACT_NAME_EMPTY when name is blank.
 * @throws CONTACT_INVALID_EMAIL when email format is invalid.
 * @throws CONTACT_WRITE_RATE_LIMITED when write throughput limits are exceeded.
 */
export const updateContact = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    contactId: v.id('contacts'),
    ...contactInputArgs,
  },
  handler: async (ctx, args) => {
    const { user } = await getWorkspaceMembership(ctx, args.workspaceId);
    await assertContactWriteRateLimit(ctx, args.workspaceId, user._id);
    const contact = await getContactForWorkspace(ctx, args.contactId, args.workspaceId);
    const normalizedInput = normalizeAndValidateContactInput(args);

    await ctx.db.patch('contacts', contact._id, {
      name: normalizedInput.name,
      email: normalizedInput.email,
      notes: normalizedInput.notes,
      updatedAt: Date.now(),
    });

    logger.info({
      event: 'contacts.updated',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        contactId: args.contactId,
        updatedByUserId: user._id,
      },
    });
  },
});

/**
 * Deletes a contact from a workspace.
 *
 * @param workspaceId - Target workspace.
 * @param contactId - Contact to delete.
 * @throws WORKSPACE_ACCESS_DENIED when caller is not a workspace member.
 * @throws CONTACT_NOT_FOUND when contact does not exist in workspace.
 * @throws CONTACT_WRITE_RATE_LIMITED when write throughput limits are exceeded.
 */
export const deleteContact = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    contactId: v.id('contacts'),
  },
  handler: async (ctx, args) => {
    const { user } = await getWorkspaceMembership(ctx, args.workspaceId);
    await assertContactWriteRateLimit(ctx, args.workspaceId, user._id);
    const contact = await getContactForWorkspace(ctx, args.contactId, args.workspaceId);

    await ctx.db.delete('contacts', contact._id);

    logger.info({
      event: 'contacts.deleted',
      category: 'WORKSPACE',
      context: {
        workspaceId: args.workspaceId,
        contactId: args.contactId,
        deletedByUserId: user._id,
      },
    });
  },
});
