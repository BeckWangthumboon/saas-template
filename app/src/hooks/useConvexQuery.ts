import { useQuery } from 'convex/react';
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';

export type QueryState<T> = { status: 'loading'; data: undefined } | { status: 'success'; data: T };

/**
 * Wraps Convex useQuery to provide consistent state shape.
 *
 * Queries are reactive and auto-fire, so they don't return Results.
 * Query errors are handled by React Error Boundaries at a higher level.
 *
 * @example
 * ```ts
 * const { status, data } = useConvexQuery(api.user.getUser, { id: '123' });
 *
 * if (status === 'loading') return <Spinner />;
 * return <User data={data} />;
 * ```
 */
export function useConvexQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: OptionalRestArgs<Query>
): QueryState<FunctionReturnType<Query>> {
  type T = FunctionReturnType<Query>;

  const data: T | undefined = useQuery(query, ...args);

  if (data === undefined) {
    return { status: 'loading', data: undefined };
  }

  return { status: 'success', data };
}
