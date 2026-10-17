import type { JSX, ReactNode } from 'react'
import { motion } from 'motion/react'
import { SPEEDS, type MotionLevel } from '../../../shared/settings'
import type { Account, Quality } from '../../../shared/types'
import { updateSettings, useSettings } from '../store/settings'
import EqualizerPanel from './EqualizerPanel'
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
  ['Медиаклавиши', 'Работают и когда окно не в фокусе']
]

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

      <Section title="Горячие клавиши" index={2}>
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys} className="setting-row shortcut">
            <kbd>{keys}</kbd>
            <span className="muted">{action}</span>
          </div>
        ))}
      </Section>

      <Section title="Аккаунт" index={3}>
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

      <p className="muted small about">
        trashee — неофициальный клиент Яндекс Музыки. Он использует закрытое API сервиса, которое
        Яндекс может изменить.
      </p>
    </div>
  )
}
