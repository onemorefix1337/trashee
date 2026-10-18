import { useEffect, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { formatBytes, useUpdate } from '../store/update'
import Logo from './Logo'

const formatDate = (iso: string): string =>
  iso
    ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

const api = (): Window['api']['update'] => window.api.update

interface Action {
  label: string
  run: () => void
  kind?: 'primary' | 'secondary' | 'text'
}

/** Shown over the whole window, with the app blurred behind it, whenever the updater has something to say. */
export default function UpdateDialog({ currentVersion }: { currentVersion: string }): JSX.Element {
  const update = useUpdate()
  const { status, info, prompt } = update
  const open =
    prompt && info !== null && ['available', 'downloading', 'ready', 'error'].includes(status)

  // Escape is "not now": snooze when asked about a new version, just close otherwise.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void (status === 'available' ? api().later() : api().dismiss())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, status])

  let title = 'Доступно обновление'
  let body: JSX.Element | null = null
  let actions: Action[] = []
  const platform = window.api.platform

  if (info && status === 'available') {
    body = !info.canInstall ? (
      <p className="update-note">
        Для этой системы готового установщика нет, обновление скачивается со страницы релиза.
      </p>
    ) : info.restart ? (
      <p className="update-note">
        trashee скачает обновление, установит его и откроется заново. Это займёт меньше минуты.
      </p>
    ) : null
    actions = [
      info.canInstall
        ? { label: 'Обновить', run: () => void api().install(), kind: 'primary' }
        : { label: 'Открыть страницу релиза', run: () => void api().openPage(), kind: 'primary' },
      { label: 'Напомнить позже', run: () => void api().later(), kind: 'secondary' },
      { label: 'Пропустить эту версию', run: () => void api().skip(), kind: 'text' }
    ]
  } else if (info && status === 'downloading') {
    const percent = update.total > 0 ? Math.min(100, (update.received / update.total) * 100) : 0
    title = `Скачиваем версию ${info.version}`
    body = (
      <div
        className="update-progress"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="update-bar">
          <motion.div
            className="update-bar-fill"
            animate={{ width: `${percent}%` }}
            transition={{ ease: 'linear', duration: 0.15 }}
          />
        </div>
        <span className="muted small">
          {formatBytes(update.received)}
          {update.total > 0 ? ` из ${formatBytes(update.total)}` : ''}
        </span>
      </div>
    )
    actions = [
      { label: 'Отмена', run: () => void api().cancel(), kind: 'secondary' },
      { label: 'Скрыть', run: () => void api().dismiss(), kind: 'text' }
    ]
  } else if (info && status === 'ready') {
    if (info.restart) {
      title = 'Устанавливаем обновление'
      body = (
        <p className="update-note">
          trashee сейчас закроется и откроется заново уже в версии {info.version}.
        </p>
      )
    } else if (platform === 'darwin') {
      title = 'Установщик открыт'
      body = (
        <p className="update-note">
          Перетащи trashee в «Программы» и согласись на замену. Потом закрой это приложение и открой
          новое.
        </p>
      )
      actions = [
        { label: 'Закрыть trashee', run: () => void api().quit(), kind: 'primary' },
        { label: 'Показать файл', run: () => void api().reveal(), kind: 'secondary' },
        { label: 'Скрыть', run: () => void api().dismiss(), kind: 'text' }
      ]
    } else {
      title = 'Новая версия скачана'
      body = (
        <p className="update-note">
          Файл AppImage лежит в «Загрузках». Закрой trashee и запусти новый файл.
        </p>
      )
      actions = [
        { label: 'Показать в папке', run: () => void api().reveal(), kind: 'primary' },
        { label: 'Скрыть', run: () => void api().dismiss(), kind: 'text' }
      ]
    }
  } else if (info && status === 'error') {
    title = 'Не получилось обновить'
    body = <p className="update-note error">{update.error}</p>
    actions = [
      { label: 'Повторить', run: () => void api().install(), kind: 'primary' },
      { label: 'Страница релиза', run: () => void api().openPage(), kind: 'secondary' },
      { label: 'Закрыть', run: () => void api().dismiss(), kind: 'text' }
    ]
  }

  return (
    <AnimatePresence>
      {open && info && (
        <motion.div
          key="update"
          className="update-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className="update-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-title"
            initial={{ opacity: 0, y: 28, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div className="update-head">
              <Logo size={40} />
              <div>
                <h2 id="update-title">{title}</h2>
                <div className="update-versions">
                  <span>{currentVersion}</span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                  <strong>{info.version}</strong>
                </div>
              </div>
            </div>

            <div className="update-meta muted small">
              {[formatDate(info.publishedAt), info.size > 0 ? formatBytes(info.size) : '']
                .filter(Boolean)
                .join(' · ')}
            </div>

            {status === 'available' && info.notes && (
              <div className="update-notes" tabIndex={0}>
                {info.notes}
              </div>
            )}
            {body}

            <div className="update-actions">
              {actions.map((action, index) => (
                <motion.button
                  key={action.label}
                  className={`update-btn ${action.kind ?? 'secondary'}`}
                  onClick={action.run}
                  autoFocus={index === 0}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {action.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
