import type { JSX, ReactNode } from 'react'
import { motion } from 'motion/react'
import { SPEEDS, type MotionLevel } from '../../../shared/settings'
import type { Account, Quality } from '../../../shared/types'
import { formatBytes as sizeText, removeOffline, useCacheInfo } from '../store/offline'
import { setMiniAnchor, toggleMini, useMiniAnchor, useMiniVisible } from '../store/mini'
import { trackWord } from '../lib/cover'
import { updateSettings, useSettings } from '../store/settings'
import { formatBytes, useAppInfo, useUpdate } from '../store/update'
import EqualizerPanel from './EqualizerPanel'
import PositionPicker from './PositionPicker'
import Segmented from './Segmented'
import Switch from './Switch'

const QUALITY_OPTIONS: { value: Quality; label: string }[] = [
  { value: 'nq', label: 'Экономное' },
  { value: 'hq', label: 'Высокое' },
  { value: 'lossless', label: 'Без потерь' }
]

const MOTION_OPTIONS: { value: MotionLevel; label: string }[] = [
  { value: 'full', label: 'Полные' },
  { value: 'reduced', label: 'Поменьше' },
  { value: 'off', label: 'Выключены' }
]

const SPEED_OPTIONS = SPEEDS.map((value) => ({
  value,
  label: value === 1 ? 'Обычная' : `×${value}`
}))

const SHORTCUTS: [string, string][] = [
  ['Пробел', 'Пауза и воспроизведение'],
  ['← →', 'Перемотка на 5 секунд'],
  ['⌘/Ctrl + ← →', 'Предыдущий и следующий трек'],
  ['⌘/Ctrl + K', 'Поиск'],
  ['L', 'Лайк текущему треку'],
  ['D', 'Не нравится: пропустить трек'],
  ['Alt + ←', 'Назад по страницам'],
  ['⌘/Ctrl + Alt + M', 'Мини-плеер поверх всех окон, из любого приложения'],
  ['Медиаклавиши', 'Работают и когда окно не в фокусе']
]

const PLATFORMS: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

const formatDate = (iso: string): string =>
  iso
    ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

function updateHint(update: ReturnType<typeof useUpdate>): string {
  const version = update.info?.version
  switch (update.status) {
    case 'checking':
      return 'Проверяем…'
    case 'available':
      return `Доступна версия ${version}${update.info?.size ? `, ${formatBytes(update.info.size)}` : ''}.`
    case 'downloading':
      return `Скачиваем версию ${version}: ${update.total ? Math.round((update.received / update.total) * 100) : 0}%`
    case 'ready':
      return `Версия ${version} скачана.`
    case 'error':
      return update.error ?? 'Не удалось проверить.'
    case 'none':
      return `Установлена последняя версия. Проверено в ${new Date(update.checkedAt ?? Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.`
    default:
      return 'Ещё не проверяли с этого запуска.'
  }
}

function CacheSection({ index }: { index: number }): JSX.Element {
  const prefetchNext = useSettings((s) => s.prefetchNext)
  const { info, reload } = useCacheInfo()
  const saved = info?.collections ?? []

  return (
    <Section title="Кеш и загрузки" index={index}>
      <Row
        title="Подгружать следующий трек"
        hint="Со второй половины трека следующий скачивается заранее, и переход к нему без ожидания."
      >
        <Switch
          label="Подгружать следующий трек"
          checked={prefetchNext}
          onChange={(checked) => updateSettings({ prefetchNext: checked })}
        />
      </Row>
      <Row
        title="Кеш прослушанного"
        hint="Подгруженные треки. Самые старые удаляются сами, когда набирается 400 МБ."
      >
        <div className="setting-buttons">
          <span className="setting-value">{info ? sizeText(info.stream) : '…'}</span>
          <motion.button
            className="chip"
            disabled={!info || info.stream === 0}
            onClick={() => void window.api.clearStreamCache().then(reload)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
          >
            Очистить
          </motion.button>
        </div>
      </Row>
      <Row
        title="Сохранено офлайн"
        hint="Плейлисты и альбомы целиком: треки, тексты и обложки. Сохраняются кнопкой на странице плейлиста."
      >
        <div className="setting-buttons">
          <span className="setting-value">
            {info ? `${saved.length ? `${saved.length} · ` : ''}${sizeText(info.offline)}` : '…'}
          </span>
          {saved.length > 0 && (
            <motion.button
              className="chip danger"
              onClick={() => void window.api.removeAllOffline().then(reload)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.93 }}
            >
              Удалить всё
            </motion.button>
          )}
        </div>
      </Row>
      {saved.map((entry) => (
        <Row
          key={entry.key}
          title={entry.title}
          hint={[trackWord(entry.trackCount), entry.subtitle].filter(Boolean).join(' · ')}
        >
          <motion.button
            className="chip"
            onClick={() => removeOffline(entry.key, entry.title)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
          >
            Убрать
          </motion.button>
        </Row>
      ))}
    </Section>
  )
}

function AboutSection({ index }: { index: number }): JSX.Element {
  const info = useAppInfo()
  const update = useUpdate()
  const busy = update.status === 'checking' || update.status === 'downloading'
  const hasUpdate = ['available', 'downloading', 'ready'].includes(update.status) && update.info

  return (
    <Section title="О приложении" index={index}>
      <Row title="Версия" hint={info && !info.packaged ? 'Запущено из исходников.' : undefined}>
        <span className="setting-value">{info?.version ?? '…'}</span>
      </Row>
      <Row title="Сборка" hint="Название сборки пригодится, если захочешь сообщить об ошибке.">
        <span className="setting-value">
          {info ? `${info.commit} · ${formatDate(info.builtAt)}` : '…'}
        </span>
      </Row>
      <Row title="Система">
        <span className="setting-value">
          {info ? `${PLATFORMS[info.platform] ?? info.platform} · ${info.arch}` : '…'}
        </span>
      </Row>
      <Row title="Движок" hint="Electron — то, на чём работает окно приложения.">
        <span className="setting-value">
          {info
            ? `Electron ${info.electron} · Chromium ${info.chrome.split('.')[0]} · Node ${info.node}`
            : '…'}
        </span>
      </Row>
      <Row title="Обновления" hint={updateHint(update)}>
        <div className="setting-buttons">
          {hasUpdate && (
            <motion.button
              className="chip accent"
              onClick={() => void window.api.update.show()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.93 }}
            >
              Обновить до {update.info?.version}
            </motion.button>
          )}
          <motion.button
            className="chip"
            disabled={busy}
            onClick={() => void window.api.update.check()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
          >
            {update.status === 'checking' ? 'Проверяем…' : 'Проверить обновления'}
          </motion.button>
        </div>
      </Row>
      <Row
        title="Проверять при запуске"
        hint="Если вышла новая версия, trashee спросит, обновляться ли."
      >
        <Switch
          label="Проверять обновления при запуске"
          checked={update.auto}
          onChange={(checked) => void window.api.update.setAuto(checked)}
        />
      </Row>
    </Section>
  )
}

function Section({
  title,
  index,
  children
}: {
  title: string
  index: number
  children: ReactNode
}): JSX.Element {
  return (
    <motion.section
      className="settings-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.06, type: 'spring', stiffness: 260, damping: 26 }}
    >
      <h3 className="section-title">{title}</h3>
      <div className="settings-card">{children}</div>
    </motion.section>
  )
}

function Row({
  title,
  hint,
  children,
  stacked = false
}: {
  title: string
  hint?: string
  children: ReactNode
  stacked?: boolean
}): JSX.Element {
  return (
    <div className={`setting-row${stacked ? ' stacked' : ''}`}>
      <div className="setting-text">
        <div className="setting-title">{title}</div>
        {hint && <div className="setting-hint">{hint}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

export default function SettingsPage({
  account,
  onLogout
}: {
  account: Account
  onLogout: () => void
}): JSX.Element {
  const quality = useSettings((s) => s.quality)
  const speed = useSettings((s) => s.speed)
  const motionLevel = useSettings((s) => s.motion)
  const visualizer = useSettings((s) => s.visualizer)
  const dynamicColors = useSettings((s) => s.dynamicColors)
  const miniVisible = useMiniVisible()
  const miniAnchor = useMiniAnchor()

  return (
    <div className="page settings">
      <div className="page-head">
        <motion.h2
          className="page-title"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
        >
          Настройки
        </motion.h2>
      </div>

      <Section title="Звук" index={0}>
        <Row
          title="Качество"
          hint={
            account.hasPlus
              ? 'Меняется со следующего трека.'
              : 'Без Яндекс Плюса «Без потерь» может не сработать, тогда Яндекс отдаст лучшее из доступного.'
          }
        >
          <Segmented
            label="Качество звука"
            options={QUALITY_OPTIONS}
            value={quality}
            onChange={(value) => updateSettings({ quality: value })}
          />
        </Row>
        <Row title="Скорость" hint="Тон остаётся прежним.">
          <Segmented
            label="Скорость воспроизведения"
            options={SPEED_OPTIONS}
            value={speed}
            onChange={(value) => updateSettings({ speed: value })}
          />
        </Row>
        <Row title="Эквалайзер" hint="Двойной клик по ползунку сбрасывает полосу." stacked>
          <EqualizerPanel />
        </Row>
      </Section>

      <Section title="Внешний вид" index={1}>
        <Row title="Анимации" hint="Если интерфейс тормозит, поставь «Поменьше» или «Выключены».">
          <Segmented
            label="Анимации"
            options={MOTION_OPTIONS}
            value={motionLevel}
            onChange={(value) => updateSettings({ motion: value })}
          />
        </Row>
        <Row title="Визуализатор" hint="Спектр звука внизу окна.">
          <Switch
            label="Визуализатор"
            checked={visualizer}
            onChange={(checked) => updateSettings({ visualizer: checked })}
          />
        </Row>
        <Row title="Цвета по обложке" hint="Фон и акценты подстраиваются под текущий трек.">
          <Switch
            label="Цвета по обложке"
            checked={dynamicColors}
            onChange={(checked) => updateSettings({ dynamicColors: checked })}
          />
        </Row>
      </Section>

      <Section title="Мини-плеер" index={2}>
        <Row
          title="Поверх всех окон"
          hint="Обложка, трек и кнопки управления в маленькой карточке. Её можно перетащить мышью."
        >
          <Switch label="Мини-плеер" checked={miniVisible} onChange={toggleMini} />
        </Row>
        <Row title="Положение" hint="Выбор места возвращает карточку на него после перетаскивания.">
          <PositionPicker value={miniAnchor} onChange={setMiniAnchor} />
        </Row>
      </Section>

      <CacheSection index={3} />

      <Section title="Горячие клавиши" index={4}>
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys} className="setting-row shortcut">
            <kbd>{keys}</kbd>
            <span className="muted">{action}</span>
          </div>
        ))}
      </Section>

      <Section title="Аккаунт" index={5}>
        <Row title={account.login} hint={account.hasPlus ? 'Яндекс Плюс' : 'Без подписки'}>
          <motion.button
            className="chip danger"
            onClick={onLogout}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
          >
            Выйти
          </motion.button>
        </Row>
      </Section>

      <AboutSection index={6} />

      <p className="muted small about">
        trashee — неофициальный клиент Яндекс Музыки. Он использует закрытое API сервиса, которое
        Яндекс может изменить.
      </p>
    </div>
  )
}
