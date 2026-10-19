import { startRecognizer } from '../lib/voice-recognizer'

/** Starts listening as soon as the page loads, and tells the app how it went. */
async function listen(): Promise<void> {
  try {
    const model = await window.voice.modelBytes()
    if (!model) throw new Error('Модель не найдена')
    await startRecognizer({
      model,
      onText: (text) => window.voice.report({ kind: 'text', text }),
      onFailure: (message) => window.voice.report({ kind: 'error', message })
    })
    window.voice.report({ kind: 'listening' })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    const message = error instanceof Error ? error.message : ''
    window.voice.report({
      kind: 'error',
      message:
        name === 'NotAllowedError' || name === 'NotFoundError' || name === 'NotReadableError'
          ? 'Микрофон недоступен. Проверь, что он подключён и разрешён для trashee.'
          : message || 'Не удалось включить микрофон'
    })
  }
}

void listen()
