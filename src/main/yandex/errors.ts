export class YandexMusicError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

/** True only when the server rejected the credentials; network failures and 5xx/451 must not log the user out. */
export function isAuthFailure(error: unknown): boolean {
  return error instanceof YandexMusicError && (error.status === 401 || error.status === 403)
}
