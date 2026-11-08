/**
 * Combines an optional cancel signal with a timeout. Written by hand instead of
 * AbortSignal.any / AbortSignal.timeout, which older browsers (still common on managed
 * work computers) do not have; without them every request failed before it was sent.
 */
export function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', onAbort)
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}
