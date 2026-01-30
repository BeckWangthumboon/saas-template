import { type OptionalRestArgsOrSkip, useQuery } from 'convex/react';
import type { FunctionReference, FunctionReturnType } from 'convex/server';

export type QueryState<T> =
  | { status: 'idle'; data: undefined }
  | { status: 'loading'; data: undefined }
  | { status: 'success'; data: T };

type QueryArgsWithSkip<Query extends FunctionReference<'query'>> = OptionalRestArgsOrSkip<Query>;

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
 * const { status, data } = useConvexQuery(api.user.getUser, condition ? { id: '123' } : 'skip');
 *
 * if (status === 'loading') return <Spinner />;
 * return <User data={data} />;
 * ```
 */
export function useConvexQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  ...args: QueryArgsWithSkip<Query>
): QueryState<FunctionReturnType<Query>> {
  type T = FunctionReturnType<Query>;

  const data: T | undefined = useQuery(query, ...args);
  const isSkipped = args[0] === 'skip';

  if (isSkipped) {
    return { status: 'idle', data: undefined };
  }

  if (data === undefined) {
    return { status: 'loading', data: undefined };
  }

  return { status: 'success', data };
}
