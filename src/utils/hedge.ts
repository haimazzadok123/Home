export type Attempt<T> = (signal: AbortSignal) => Promise<T>

export class AllAttemptsFailedError extends Error {
  errors: unknown[]
  constructor(errors: unknown[]) {
    super('All attempts failed')
    this.errors = errors
  }
}

/**
 * Runs attempts against several servers and returns the first success. The first attempt
 * starts right away; the next one starts after `staggerMs` if nothing has answered yet, or
 * at once when a running attempt fails. The losers are aborted. This keeps a slow or
 * blocked server from holding up the search for its whole timeout, without hitting every
 * free server on every request.
 */
export function firstSuccessful<T>(
  attempts: Attempt<T>[],
  staggerMs: number,
  signal?: AbortSignal,
): Promise<{ value: T; index: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const controllers: AbortController[] = []
    const errors: unknown[] = []
    let next = 0
    let running = 0
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      settled = true
      clearTimeout(timer)
      for (const c of controllers) c.abort()
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      if (settled) return
      finish()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort)

    const launch = () => {
      if (settled || next >= attempts.length) return
      const index = next++
      const controller = new AbortController()
      controllers.push(controller)
      running++
      clearTimeout(timer)
      if (next < attempts.length) timer = setTimeout(launch, staggerMs)

      attempts[index](controller.signal).then(
        (value) => {
          if (settled) return
          finish()
          resolve({ value, index })
        },
        (err) => {
          if (settled) return
          running--
          errors.push(err)
          if (next < attempts.length) launch()
          else if (running === 0) {
            finish()
            reject(new AllAttemptsFailedError(errors))
          }
        },
      )
    }

    launch()
  })
}

/** Puts the server that answered last time first, so later searches go straight to it. */
export function preferredOrder<T>(storageKey: string, items: T[], idOf: (item: T) => string): T[] {
  let preferred: string | null = null
  try {
    preferred = localStorage.getItem(storageKey)
  } catch {
    // storage unavailable: keep the default order
  }
  const i = items.findIndex((item) => idOf(item) === preferred)
  return i > 0 ? [items[i], ...items.slice(0, i), ...items.slice(i + 1)] : items
}

export function rememberPreferred(storageKey: string, id: string) {
  try {
    localStorage.setItem(storageKey, id)
  } catch {
    // storage unavailable: nothing to remember
  }
}
