import { useMutation } from 'convex/react';
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from 'convex/server';
import { err, ok, type Result } from 'neverthrow';
import { useCallback, useRef, useState } from 'react';

import { type AppErrorData, ErrorCategory, ErrorCode, parseAppError } from '../../shared/errors';

export type MutationState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: AppErrorData };

export interface UseConvexMutationReturn<Mutation extends FunctionReference<'mutation'>> {
  mutate: (
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<Result<FunctionReturnType<Mutation>, AppErrorData>>;
  mutateStrict: (
    ...args: OptionalRestArgs<Mutation>
  ) => Promise<Result<FunctionReturnType<Mutation>, AppErrorData>>;
  state: MutationState<FunctionReturnType<Mutation>>;
  reset: () => void;
}

const createRequestInFlightError = (): AppErrorData => ({
  code: ErrorCode.REQUEST_IN_FLIGHT,
  category: ErrorCategory.INTERNAL,
  message: 'Request already in flight',
  timestamp: new Date().toISOString(),
});

/**
 * Wraps Convex useMutation with neverthrow Result pattern and state tracking.
 *
 * @example
 * ```ts
 * const { mutate, state, reset } = useConvexMutation(api.users.index.updateName);
 * const { mutateStrict } = useConvexMutation(api.users.index.updateName);
 *
 * const handleSubmit = async () => {
 *   const result = await mutate({ firstName: 'John', lastName: 'Doe' });
 *
 *   if (result.isOk()) {
 *     toast.success('Profile updated');
 *   } else {
 *     // result.error is typed AppErrorData
 *     toast.error(result.error.message);
 *   }
 * };
 *
 * const handleSubmitStrict = async () => {
 *   const result = await mutateStrict({ firstName: 'John', lastName: 'Doe' });
 *   if (result.isErr() && result.error.code === ErrorCode.REQUEST_IN_FLIGHT) return;
 * };
 *
 * // Or use state for UI rendering
 * if (state.status === 'loading') return <Spinner />;
 * ```
 */
export function useConvexMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
): UseConvexMutationReturn<Mutation> {
  type T = FunctionReturnType<Mutation>;

  const convexMutation = useMutation(mutation);
  const [state, setState] = useState<MutationState<T>>({ status: 'idle' });
  const inFlightRef = useRef(false);
  const inFlightPromiseRef = useRef<Promise<Result<T, AppErrorData>> | null>(null);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const mutate = useCallback(
    (...args: OptionalRestArgs<Mutation>): Promise<Result<T, AppErrorData>> => {
      if (inFlightRef.current) {
        return inFlightPromiseRef.current ?? Promise.resolve(err(createRequestInFlightError()));
      }

      inFlightRef.current = true;
      const promise = (async () => {
        setState({ status: 'loading' });

        try {
          const result = await convexMutation(...args);
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
    [convexMutation],
  );

  const mutateStrict = useCallback(
    async (...args: OptionalRestArgs<Mutation>): Promise<Result<T, AppErrorData>> => {
      if (inFlightRef.current) {
        return err(createRequestInFlightError());
      }

      return mutate(...args);
    },
    [mutate],
  );

  return { mutate, mutateStrict, state, reset };
}
