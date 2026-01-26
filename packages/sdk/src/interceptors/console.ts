import type { ConsoleMessage, SdkMessage } from '@android-debugger/shared';

type SendFn = (message: SdkMessage) => void;

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface OriginalConsole {
  log: typeof console.log;
  info: typeof console.info;
  warn: typeof console.warn;
  error: typeof console.error;
  debug: typeof console.debug;
}

let originalConsole: OriginalConsole | null = null;

export function interceptConsole(send: SendFn): () => void {
  if (originalConsole) {
    // Already intercepted
    return () => {};
  }

  originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const createInterceptor = (level: ConsoleLevel) => {
    return (...args: unknown[]) => {
      // Call original console method
      originalConsole?.[level]?.(...args);

      // Send to debugger
      const message: ConsoleMessage = {
        level,
        args: args.map(serializeArg),
        timestamp: Date.now(),
      };

      send({
        type: 'console',
        timestamp: Date.now(),
        payload: message,
      });
    };
  };

  console.log = createInterceptor('log');
  console.info = createInterceptor('info');
  console.warn = createInterceptor('warn');
  console.error = createInterceptor('error');
  console.debug = createInterceptor('debug');

  // Return restore function
  return () => {
    if (originalConsole) {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.debug = originalConsole.debug;
      originalConsole = null;
    }
  };
}

function serializeArg(arg: unknown): unknown {
  if (arg === null) return null;
  if (arg === undefined) return 'undefined';

  if (typeof arg === 'function') {
    return `[Function: ${arg.name || 'anonymous'}]`;
  }

  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: arg.message,
      stack: arg.stack,
    };
  }

  if (typeof arg === 'object') {
    try {
      // Handle circular references
      const seen = new WeakSet();
      return JSON.parse(
        JSON.stringify(arg, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        })
      );
    } catch {
      return String(arg);
    }
  }

  return arg;
}
