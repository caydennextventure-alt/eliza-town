let noisyEnabled = false;

export function setNoisyLoggingEnabled(enabled: boolean) {
  noisyEnabled = enabled;
}

export function noisyLog(...args: unknown[]) {
  if (!noisyEnabled) {
    return;
  }
  console.log(...args);
}

export function noisyWarn(...args: unknown[]) {
  if (!noisyEnabled) {
    return;
  }
  console.warn(...args);
}

export function noisyDebug(...args: unknown[]) {
  if (!noisyEnabled) {
    return;
  }
  console.debug(...args);
}
