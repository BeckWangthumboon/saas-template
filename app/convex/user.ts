import { query } from './_generated/server';
import { authKit } from './auth';

export const getCurrentUser = query({
  args: {},
  handler: async (ctx, _args) => {
    const user = await authKit.getAuthUser(ctx);
    return user;
  },
});
