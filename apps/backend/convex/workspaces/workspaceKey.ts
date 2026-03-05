import type { MutationCtx } from '../functions';

const WORKSPACE_KEY_LENGTH = 10;
const WORKSPACE_KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const randomWorkspaceKey = () => {
  let key = '';

  for (let index = 0; index < WORKSPACE_KEY_LENGTH; index += 1) {
    const alphabetIndex = Math.floor(Math.random() * WORKSPACE_KEY_ALPHABET.length);
    key += WORKSPACE_KEY_ALPHABET[alphabetIndex];
  }

  return key;
};

export const generateWorkspaceKey = async (ctx: MutationCtx): Promise<string> => {
  for (;;) {
    const candidate = randomWorkspaceKey();
    const existingWorkspace = await ctx.db
      .query('workspaces')
      .withIndex('by_workspaceKey', (q) => q.eq('workspaceKey', candidate))
      .unique();

    if (!existingWorkspace) {
      return candidate;
    }
  }
};
