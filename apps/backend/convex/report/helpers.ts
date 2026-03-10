import { ErrorCode } from '@saas/shared/errors';

import type { Doc, Id } from '../_generated/dataModel';
import { throwAppErrorForConvex } from '../errors';
import type { MutationCtx, QueryCtx } from '../functions';

type ActiveTrackedProduct = Doc<'trackedProducts'> & { status: 'active' };

export const isActiveTrackedProduct = (
  trackedProduct: Doc<'trackedProducts'>,
): trackedProduct is ActiveTrackedProduct => trackedProduct.status === 'active';

export async function getTrackedProductForWorkspace(
  ctx: QueryCtx | MutationCtx,
  trackedProductId: Id<'trackedProducts'>,
  workspaceId: Id<'workspaces'>,
) {
  const trackedProduct = await ctx.db.get('trackedProducts', trackedProductId);

  if (
    !trackedProduct ||
    !isActiveTrackedProduct(trackedProduct) ||
    trackedProduct.workspaceId !== workspaceId
  ) {
    return throwAppErrorForConvex(ErrorCode.WORKSPACE_ACCESS_DENIED, {
      workspaceId: workspaceId as string,
    });
  }

  return trackedProduct;
}
