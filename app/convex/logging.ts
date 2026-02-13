import { convexEnv } from './env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'AUTH' | 'WORKSPACE' | 'INVITE' | 'BILLING' | 'INTERNAL';

export interface LogEvent {
  event: string;
  category: LogCategory;
  context?: Record<string, unknown>;
  error?: unknown;
}

interface LogErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Returns whether a log level should be emitted for the current environment.
 *
 * @param level - Log level for the event being emitted.
 * @returns True when the log level meets or exceeds configured threshold.
 */
const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[convexEnv.logLevel];
};

/**
 * Normalizes unknown error values into a structured payload.
 *
 * @param error - Unknown caught error value.
 * @returns Structured error payload suitable for JSON logging.
 */
const normalizeError = (error: unknown): LogErrorPayload => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const maybeName = (error as { name?: unknown }).name;
    const maybeMessage = (error as { message?: unknown }).message;

    return {
      name: typeof maybeName === 'string' ? maybeName : 'UnknownError',
      message: typeof maybeMessage === 'string' ? maybeMessage : String(maybeMessage),
    };
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : String(error),
  };
};

/**
 * Converts an event payload into a safe JSON string for structured logging.
 *
 * @param value - Structured event payload.
 * @returns Serialized JSON payload.
 */
const stringifyLogPayload = (value: Record<string, unknown>): string => {
  try {
    return JSON.stringify(value, (_key, currentValue: unknown) => {
      if (currentValue instanceof Error) {
        return normalizeError(currentValue);
      }

      if (typeof currentValue === 'bigint') {
        return currentValue.toString();
      }

      return currentValue;
    });
  } catch (error) {
    return JSON.stringify({
      event: 'internal.logging.stringify_failed',
      category: 'INTERNAL',
      level: 'error',
      timestamp: new Date().toISOString(),
      error: normalizeError(error),
    });
  }
};

/**
 * Emits a structured JSON log line using the matching console method.
 *
 * @param level - Severity level of the event.
 * @param event - Structured event payload.
 */
const emit = (level: LogLevel, event: LogEvent): void => {
  if (!shouldLog(level)) {
    return;
  }

  const payload: Record<string, unknown> = {
    event: event.event,
    category: event.category,
    level,
    timestamp: new Date().toISOString(),
    context: event.context ?? {},
  };

  if (event.error !== undefined) {
    payload.error = normalizeError(event.error);
  }

  const serializedPayload = stringifyLogPayload(payload);

  switch (level) {
    case 'debug':
      console.debug(serializedPayload);
      return;
    case 'info':
      console.info(serializedPayload);
      return;
    case 'warn':
      console.warn(serializedPayload);
      return;
    case 'error':
      console.error(serializedPayload);
      return;
  }
};

/**
 * Shared backend logger for Convex functions.
 *
 * Logs are emitted as structured JSON strings and gated by `CONVEX_LOG_LEVEL`.
 */
export const logger = {
  debug: (event: LogEvent): void => {
    emit('debug', event);
  },
  info: (event: LogEvent): void => {
    emit('info', event);
  },
  warn: (event: LogEvent): void => {
    emit('warn', event);
  },
  error: (event: LogEvent): void => {
    emit('error', event);
  },
};
