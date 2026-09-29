import type { SdkMessage } from '@android-debugger/shared';

/**
 * JSON.stringify that never throws on the values apps actually log: circular
 * references become "[Circular]", BigInts become "123n" and Errors keep their
 * name, message and stack (their own properties are non-enumerable, so plain
 * JSON.stringify would turn them into {}).
 */
export function safeStringify(value: unknown): string {
  // Objects on the path from the root to the value being serialized. Unlike a
  // set of every object seen so far, this only flags real cycles, not objects
  // that are referenced twice.
  const ancestors: unknown[] = [];
  return JSON.stringify(value, function (this: unknown, _key: string, val: unknown) {
    if (typeof val === 'bigint') return `${val}n`;
    if (typeof val !== 'object' || val === null) return val;

    // `this` is the object holding `val`; drop ancestors we've finished with.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
    if (ancestors.includes(val)) return '[Circular]';

    const out = val instanceof Error ? { name: val.name, message: val.message, stack: val.stack } : val;
    ancestors.push(out);
    return out;
  }) ?? 'null';
}

/** A console message from the SDK itself, e.g. to report dropped messages. */
export function sdkNotice(level: 'warn' | 'error', text: string): SdkMessage {
  const now = Date.now();
  return {
    type: 'console',
    timestamp: now,
    payload: { level, args: [`[AndroidDebugger] ${text}`], timestamp: now },
  };
}
