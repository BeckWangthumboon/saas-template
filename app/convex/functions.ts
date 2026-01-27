import { customCtx, customMutation } from 'convex-helpers/server/customFunctions';
import { Triggers } from 'convex-helpers/server/triggers';

import type { DataModel } from './_generated/dataModel';
import {
  action,
  type ActionCtx,
  internalMutation as rawInternalMutation,
  internalQuery,
  mutation as rawMutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from './_generated/server';

const triggers = new Triggers<DataModel>();

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));

export { triggers };
export { action, internalQuery, query };
export type { ActionCtx, MutationCtx, QueryCtx };
