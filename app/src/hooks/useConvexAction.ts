import { useAction } from 'convex/react';
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';
import { err, ok, type Result } from 'neverthrow';
import { useCallback, useRef, useState } from 'react';

import { type AppErrorData, ErrorCategory, ErrorCode, parseAppError } from '../../shared/errors';

export type ActionState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: AppErrorData };

export interface UseConvexActionReturn<Action extends FunctionReference<'action'>> {
  execute: (
    ...args: OptionalRestArgs<Action>
  ) => Promise<Result<FunctionReturnType<Action>, AppErrorData>>;
  executeStrict: (
    ...args: OptionalRestArgs<Action>
  ) => Promise<Result<FunctionReturnType<Action>, AppErrorData>>;
  state: ActionState<FunctionReturnType<Action>>;
  reset: () => void;
}

const createRequestInFlightError = (): AppErrorData => ({
  code: ErrorCode.REQUEST_IN_FLIGHT,
  category: ErrorCategory.INTERNAL,
  message: 'Request already in flight',
  timestamp: new Date().toISOString(),
});

/**
 * Wraps Convex useAction with neverthrow Result pattern and state tracking.
 *
 * @example
 * ```ts
 * const { execute, state, reset } = useConvexAction(api.someAction);
 * const { executeStrict } = useConvexAction(api.someAction);
 *
 * const handleAction = async () => {
 *   const result = await execute();
 *
 *   if (result.isOk()) {
 *     toast.success('Action completed');
 *   } else {
 *     // result.error is typed AppErrorData
 *     toast.error(result.error.message);
 *   }
 * };
 *
 * const handleActionStrict = async () => {
 *   const result = await executeStrict();
 *   if (result.isErr() && result.error.code === ErrorCode.REQUEST_IN_FLIGHT) return;
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
  const inFlightRef = useRef(false);
  const inFlightPromiseRef = useRef<Promise<Result<T, AppErrorData>> | null>(null);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const execute = useCallback(
    (...args: OptionalRestArgs<Action>): Promise<Result<T, AppErrorData>> => {
      if (inFlightRef.current) {
        return inFlightPromiseRef.current ?? Promise.resolve(err(createRequestInFlightError()));
      }

      inFlightRef.current = true;
      const promise = (async () => {
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
        } finally {
          inFlightRef.current = false;
          inFlightPromiseRef.current = null;
        }
      })();

      inFlightPromiseRef.current = promise;
      return promise;
    },
    [convexAction],
  );

  const executeStrict = useCallback(
    async (...args: OptionalRestArgs<Action>): Promise<Result<T, AppErrorData>> => {
      if (inFlightRef.current) {
        return err(createRequestInFlightError());
      }

      return execute(...args);
    },
    [execute],
  );

  return { execute, executeStrict, state, reset };
}
