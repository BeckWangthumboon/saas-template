import { triggers } from '../functions';
import { deleteR2Object } from '../storage/r2';

triggers.register('workspaceFiles', async (ctx, change) => {
  if (change.operation !== 'delete') {
    return;
  }

  await deleteR2Object(ctx, change.oldDoc.key);
});
