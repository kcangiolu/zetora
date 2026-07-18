function isDebugEnabled(namespace: string): boolean {
  if (typeof process === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  const pattern = process.env.LOG_DEBUG;
  if (!pattern) return false;
  if (pattern === '*') return true;
  return pattern
    .split(',')
    .map((s) => s.trim())
    .includes(namespace);
}

export function createLogger(namespace: string) {
  return {
    debug(...args: unknown[]) {
      if (isDebugEnabled(namespace)) console.debug(`[${namespace}]`, ...args);
    },
    info(...args: unknown[]) {
      if (isDebugEnabled(namespace)) console.info(`[${namespace}]`, ...args);
    },
    warn(...args: unknown[]) {
      console.warn(`[${namespace}]`, ...args);
    },
    error(...args: unknown[]) {
      console.error(`[${namespace}]`, ...args);
    },
  };
}
