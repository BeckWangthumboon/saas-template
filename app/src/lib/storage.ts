import { z } from 'zod';

interface StorageConfig<T> {
  key: string;
  schema: z.ZodType<T>;
  default: T;
  version: number;
  migrate?: (oldData: unknown, oldVersion: number | undefined) => unknown;
}

/**
 * Creates a type-safe localStorage wrapper with versioning and migration support.
 *
 * Returns an object with `get()`, `set()`, and `remove()` methods. Data is stored
 * with version metadata (`{ v: version, data: actualData }`) to enable migrations
 * when the schema changes. Invalid or missing data returns the configured default value.
 *
 * @template T - The TypeScript type of the stored data (inferred from schema)
 * @param config - Storage configuration with key, schema, default value, version, and optional migrate function
 * @returns Storage interface with get(), set(), and remove() methods
 *
 * @example
 * ```ts
 * const storage = defineStorageKey({
 *   key: 'user-prefs',
 *   schema: z.object({ theme: z.enum(['light', 'dark']) }),
 *   default: { theme: 'light' },
 *   version: 1,
 * });
 * ```
 */
export function defineStorageKey<T>(config: StorageConfig<T>) {
  const write = (value: T): void => {
    try {
      const validated = config.schema.parse(value);
      const payload = { v: config.version, data: validated };
      localStorage.setItem(config.key, JSON.stringify(payload));
    } catch {
      // silent fail
    }
  };

  const readRaw = (): unknown => {
    const item = localStorage.getItem(config.key);
    if (item === null) return undefined;
    return JSON.parse(item) as unknown;
  };

  return {
    get(): T {
      try {
        const parsed = readRaw();
        if (parsed === undefined) return config.default;

        const isWrapped =
          typeof parsed === 'object' && parsed !== null && 'data' in parsed && 'v' in parsed;

        const stored = isWrapped
          ? (parsed as { v?: number; data: unknown })
          : ({ v: undefined, data: parsed } as const);

        if (typeof stored.v === 'number' && stored.v > config.version) {
          return config.default;
        }

        if (stored.v !== config.version) {
          if (!config.migrate) {
            try {
              localStorage.removeItem(config.key);
            } catch {
              // silent fail
            }
            return config.default;
          }

          const migratedUnknown = config.migrate(stored.data, stored.v);
          const migrated = config.schema.parse(migratedUnknown);
          write(migrated);
          return migrated;
        }

        return config.schema.parse(stored.data);
      } catch {
        try {
          localStorage.removeItem(config.key);
        } catch {
          // silent fail
        }
        return config.default;
      }
    },

    set(value: T): void {
      write(value);
    },

    remove(): void {
      try {
        localStorage.removeItem(config.key);
      } catch {
        // silent fail
      }
    },
  };
}

export const defaultWorkspaceStorage = defineStorageKey({
  key: 'defaultWorkspaceId',
  schema: z.string().nullable(),
  default: null,
  version: 1,
});
