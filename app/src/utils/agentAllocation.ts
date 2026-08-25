import type { CliType } from '../types';

/**
 * Keep the Tauri payload sparse. Persisted fleets contain zeroes for every CLI,
 * but sending those keys makes an older desktop backend reject newly-added
 * variants even though the user did not allocate them.
 */
export function activeAgentAllocation(
  allocation: Record<CliType, number>
): Partial<Record<CliType, number>> {
  return Object.fromEntries(
    Object.entries(allocation).filter(([, count]) => Number.isInteger(count) && count > 0)
  ) as Partial<Record<CliType, number>>;
}

export function humanizeAgentVariantMismatch(error: unknown): Error | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/unknown variant [`'"]([^`'"]+)[`'"]/i);
  if (!match) return null;
  return new Error(
    `The running YzPzCode desktop backend does not support the "${match[1]}" CLI yet. Restart YzPzCode to load the updated backend, then try again.`
  );
}
