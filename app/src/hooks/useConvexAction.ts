import { useAction } from 'convex/react';
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';
import { err, ok, type Result } from 'neverthrow';
import { useCallback, useState } from 'react';

import { type AppErrorData, ErrorCode, parseAppError } from '../../shared/errors';

export type ActionState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: AppErrorData };

export interface UseConvexActionReturn<Action extends FunctionReference<'action'>> {
  execute: (
    ...args: OptionalRestArgs<Action>
  ) => Promise<Result<FunctionReturnType<Action>, AppErrorData>>;
  state: ActionState<FunctionReturnType<Action>>;
  reset: () => void;
}

/**
 * Wraps Convex useAction with neverthrow Result pattern and state tracking.
 *
 * @example
 * ```ts
 * const { execute, state, reset } = useConvexAction(api.user.deleteAccount);
 *
 * const handleDelete = async () => {
 *   const result = await execute();
 *
 *   if (result.isOk()) {
 *     toast.success('Account deleted');
 *     redirect('/');
 *   } else {
 *     // result.error is typed AppErrorData
 *     toast.error(result.error.message);
 *   }
 * };
 *
 * // Or use state for UI rendering
 * if (state.status === 'loading') return <Spinner />;
 * ```
 */
export function useConvexAction<Action extends FunctionReference<'action'>>(
  action: Action,
): UseConvexActionReturn<Action> {
  type T = FunctionReturnType<Action>;

  const convexAction = useAction(action);
  const [state, setState] = useState<ActionState<T>>({ status: 'idle' });

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const execute = useCallback(
    async (...args: OptionalRestArgs<Action>): Promise<Result<T, AppErrorData>> => {
      setState({ status: 'loading' });

      try {
        const result = await convexAction(...args);
        setState({ status: 'success', data: result });
        return ok(result);
      } catch (e: unknown) {
        const parsed = parseAppError(e);
        const error: AppErrorData = parsed ?? {
          code: ErrorCode.INTERNAL_ERROR,
          category: 'INTERNAL',
          message: e instanceof Error ? e.message : 'An unexpected error occurred',
          timestamp: new Date().toISOString(),
        };
        setState({ status: 'error', error });
        return err(error);
      }
    },
    [convexAction],
  );

  return { execute, state, reset };
}
