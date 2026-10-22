import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { miniShortcut } from '../../../shared/mini'
import { SPEEDS, closeToTrayOn, type MotionLevel } from '../../../shared/settings'
import { ENROLL_PHRASES, VOICE_COMMANDS, type SpeakerStrictness } from '../../../shared/voice'
import type { Account, Quality } from '../../../shared/types'
import { formatBytes as sizeText, removeOffline, useCacheInfo } from '../store/offline'
import {
  setMiniAnchor,
  setMiniLook,
  toggleMini,
  useMiniAnchor,
  useMiniLook,
  useMiniVisible
} from '../store/mini'
import { DEFAULT_MINI_LOOK, MINI_LIMITS } from '../../../shared/mini'
import { trackWord } from '../lib/cover'
import { updateSettings, useSettings } from '../store/settings'
import { formatBytes, useAppInfo, useUpdate } from '../store/update'
import EqualizerPanel from './EqualizerPanel'
import PositionPicker from './PositionPicker'
import RangeField from './RangeField'
import { PairingCode } from './SyncSettings'
import { useSyncSettings } from '../store/syncSettings'
import {
  cancelEnrollment,
  cancelVoiceDownload,
  deleteVoiceProfile,
  removeVoiceModel,
  retryVoice,
  setSpeakerCheck,
  setVoiceEnabled,
  startEnrollment,
  useVoice
} from '../store/voice'
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

const shortcuts = (): [string, string][] => [
  ['Пробел', 'Пауза и воспроизведение'],
  ['← →', 'Перемотка на 5 секунд'],
  ['⌘/Ctrl + ← →', 'Предыдущий и следующий трек'],
  ['⌘/Ctrl + K', 'Поиск'],
  ['L', 'Лайк текущему треку'],
  ['D', 'Не нравится: пропустить трек'],
  ['Alt + ←', 'Назад по страницам'],
  [miniShortcut(window.api.platform).label, 'Мини-плеер поверх всех окон, из любого приложения'],
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

/** The microphone's level on a log scale, with a mark where sound starts to count as speech. */
function LevelMeter({ level, threshold }: { level: number; threshold: number }): JSX.Element {
  const percent = (value: number): number =>
    Math.max(0, Math.min(100, ((Math.log10(Math.max(value, 1e-4)) + 4) / 4) * 100))
  return (
    <div className="voice-meter" aria-hidden="true">
      <div
        className={`voice-meter-fill${level >= threshold ? ' over' : ''}`}
        style={{ width: `${percent(level)}%` }}
      />
      <div className="voice-meter-mark" style={{ left: `${percent(threshold)}%` }} />
    </div>
  )
}

const STRICTNESS_OPTIONS: { value: SpeakerStrictness; label: string }[] = [
  { value: 'soft', label: 'Мягко' },
  { value: 'normal', label: 'Обычно' },
  { value: 'strict', label: 'Строго' }
]

const sensitivityText = (value: number): string =>
  `${value < 34 ? 'Низкая' : value < 67 ? 'Средняя' : 'Высокая'} · ${value}`

/** Spoken commands: the switch, what the microphone is doing, how picky it is, and what can be said. */
function VoiceSection(): JSX.Element {
  const enabled = useSettings((s) => s.voice)
  const sensitivity = useSettings((s) => s.voiceSensitivity)
  const requireWake = useSettings((s) => s.voiceRequireWake)
  const noiseSuppression = useSettings((s) => s.voiceNoiseSuppression)
  const speakerCheck = useSettings((s) => s.voiceSpeakerCheck)
  const strictness = useSettings((s) => s.voiceSpeakerStrictness)
  const phase = useVoice((s) => s.phase)
  const history = useVoice((s) => s.history)
  const error = useVoice((s) => s.error)
  const models = useVoice((s) => s.models)
  const level = useVoice((s) => s.level)
  const threshold = useVoice((s) => s.threshold)
  const profile = useVoice((s) => s.profile)
  const enrollment = useVoice((s) => s.enrollment)

  const status = (): { text: string; action?: { label: string; run: () => void } } | null => {
    if (!enabled) return null
    if (models.speech.status === 'downloading') {
      return {
        text: `Скачиваю модель распознавания: ${formatBytes(models.speech.received)} из ${formatBytes(models.speech.total)}`,
        action: { label: 'Отменить', run: () => cancelVoiceDownload('speech') }
      }
    }
    if (phase === 'error') {
      return { text: error ?? 'Не получилось', action: { label: 'Повторить', run: retryVoice } }
    }
    if (phase === 'starting') return { text: 'Запускаю…' }
    if (phase === 'listening') return { text: 'Слушаю' }
    return null
  }
  const current = status()

  const speakerHint = (): string => {
    if (models.speaker.status === 'downloading') {
      return `Скачиваю модель голоса: ${formatBytes(models.speaker.received)} из ${formatBytes(models.speaker.total)}`
    }
    if (models.speaker.status === 'error')
      return models.speaker.error ?? 'Модель голоса не скачалась'
    return 'Команды чужим голосом не выполняются. Один раз нужно записать свой голос: пять фраз вслух. Скачается модель голоса, около 40 МБ. Это бета: может иногда не узнать тебя, особенно в шуме или в другом микрофоне.'
  }

  return (
    <Section title="Голос" index={4}>
      <Row
        title="Голосовое управление"
        hint="Скажи «trashee, дальше» или просто «дальше». Всё распознаётся на компьютере, без интернета, звук нигде не сохраняется. В наушниках надёжнее: колонки слышны микрофону."
      >
        <Switch label="Голосовое управление" checked={enabled} onChange={setVoiceEnabled} />
      </Row>
      {current && (
        <Row title="Состояние" hint={current.text}>
          {current.action && (
            <button className="chip" onClick={current.action.run}>
              {current.action.label}
            </button>
          )}
        </Row>
      )}
      {enabled && history.length > 0 && (
        <Row
          title="Последнее услышанное"
          hint="Что расслышал и что из этого вышло. Если команды не срабатывают, здесь видно почему."
          stacked
        >
          <ul className="voice-history">
            {history.map((entry, i) => (
              <li key={i}>
                <span>«{entry.text}»</span>
                <span className="muted">{entry.verdict}</span>
              </li>
            ))}
          </ul>
        </Row>
      )}
      <Row
        title="Чувствительность"
        hint="Выше — слышит тише и дальше от микрофона, но чаще срабатывает зря. Полоска — громкость микрофона: звук за чертой идёт в распознавание."
        stacked
      >
        <RangeField
          label="Чувствительность микрофона"
          value={sensitivity}
          min={0}
          max={100}
          format={sensitivityText}
          onChange={(value) => updateSettings({ voiceSensitivity: value })}
        />
        {enabled && phase === 'listening' && <LevelMeter level={level} threshold={threshold} />}
      </Row>
      <Row
        title="Только со словом «trashee»"
        hint="Одно «дальше» без него не сработает. Меньше случайных срабатываний, если рядом говорят или играет что-то с речью."
      >
        <Switch
          label="Только со словом trashee"
          checked={requireWake}
          onChange={(checked) => updateSettings({ voiceRequireWake: checked })}
        />
      </Row>
      <Row
        title="Подавление шума"
        hint="Шумоподавление системы для микрофона. Если голос слышно плохо или он искажается, попробуй выключить."
      >
        <Switch
          label="Подавление шума"
          checked={noiseSuppression}
          onChange={(checked) => updateSettings({ voiceNoiseSuppression: checked })}
        />
      </Row>
      <Row title="Только мой голос · бета" hint={speakerHint()}>
        <Switch
          label="Только мой голос"
          checked={speakerCheck && profile !== null}
          onChange={setSpeakerCheck}
        />
      </Row>
      {enrollment && (
        <Row
          title={`Прочитай вслух (${enrollment.step + 1} из ${ENROLL_PHRASES.length})`}
          hint={`«${enrollment.phrase}». Обычным голосом, как будешь давать команды. Следующая фраза появится, когда эту услышу.`}
        >
          <button className="chip" onClick={cancelEnrollment}>
            Отменить
          </button>
        </Row>
      )}
      {profile && !enrollment && (
        <>
          <Row
            title="Голос записан"
            hint={`Образцов: ${profile.samples}, свой порог сходства ${Math.round(profile.threshold * 100)}%. Подстраивается под твой голос с каждой узнанной командой. Если перестал узнавать, перезапиши с тем микрофоном, что обычно.`}
          >
            <div className="row-buttons">
              <button className="chip" onClick={() => void startEnrollment()}>
                Перезаписать
              </button>
              <button className="chip" onClick={deleteVoiceProfile}>
                Удалить
              </button>
            </div>
          </Row>
          <Row
            title="Насколько строго"
            hint="Строже — меньше шансов, что сработает чужой голос, но чаще не узнаёт тебя."
          >
            <Segmented
              label="Строгость проверки голоса"
              options={STRICTNESS_OPTIONS}
              value={strictness}
              onChange={(value) => updateSettings({ voiceSpeakerStrictness: value })}
            />
          </Row>
        </>
      )}
      <Row
        title="Команды"
        hint="Одна команда без лишних слов сработает сама. Со словом «trashee» можно говорить свободнее: «trashee, поставь на паузу». Команда внутри разговора, вопроса или с «не» не выполняется."
        stacked
      >
        <ul className="voice-commands">
          {VOICE_COMMANDS.map((command) => (
            <li key={command.type}>
              <span>{command.label}</span>
              <span className="muted">{command.phrases.slice(0, 3).join(', ')}</span>
            </li>
          ))}
        </ul>
      </Row>
      {models.speech.status === 'ready' && !enabled && (
        <Row
          title="Модель распознавания"
          hint={`Занимает ${formatBytes(models.speech.total)}. Скачается снова, когда включишь голос.`}
        >
          <button className="chip" onClick={() => removeVoiceModel('speech')}>
            Удалить
          </button>
        </Row>
      )}
      {models.speaker.status === 'ready' && !speakerCheck && !enrollment && (
        <Row
          title="Модель голоса"
          hint={`Занимает ${formatBytes(models.speaker.total)}. Скачается снова, когда включишь «Только мой голос».`}
        >
          <button className="chip" onClick={() => removeVoiceModel('speaker')}>
            Удалить
          </button>
        </Row>
      )}
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
  const closeToTray = useSettings((s) => s.closeToTray)
  const discord = useSettings((s) => s.discord)
  const syncEnabled = useSettings((s) => s.sync)
  const { sync, pairing, startPairing, stopPairing } = useSyncSettings()
  // Discord needs an application registered by whoever builds the app; without one the row stays hidden.
  const [discordAvailable, setDiscordAvailable] = useState(false)
  useEffect(() => {
    void window.api.discordAvailable().then(setDiscordAvailable)
  }, [])
  const miniVisible = useMiniVisible()
  const miniAnchor = useMiniAnchor()
  const miniLook = useMiniLook()

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

      <Section title="Окно" index={2}>
        <Row
          title={
            window.api.platform === 'darwin'
              ? 'Играть после закрытия окна'
              : 'Сворачивать в трей при закрытии'
          }
          hint={
            window.api.platform === 'darwin'
              ? 'Крестик прячет окно, музыка продолжает играть. Вернуть окно можно из Dock или значка в строке меню.'
              : 'Крестик прячет окно, музыка продолжает играть. Вернуть окно и управлять музыкой можно из значка в трее.'
          }
        >
          <Switch
            label="Сворачивать в трей при закрытии"
            checked={closeToTrayOn(closeToTray, window.api.platform)}
            onChange={(checked) => updateSettings({ closeToTray: checked })}
          />
        </Row>
      </Section>

      <Section title="Синхронизация" index={3}>
        <Row
          title="Телефон рядом"
          hint="Передавать музыку между компьютером и телефоном в одной сети и управлять одним с другого. Пока выключено, компьютер ничего не слушает в сети."
        >
          <Switch
            label="Синхронизация с телефоном"
            checked={syncEnabled}
            onChange={(checked) => updateSettings({ sync: checked })}
          />
        </Row>
        {sync.enabled && (
          <Row
            title="Подключить телефон"
            hint="Нужен trashee на телефоне, подключённом к той же Wi-Fi сети. Токен Яндекса между устройствами не передаётся."
            stacked={pairing !== null}
          >
            {pairing ? (
              <>
                <PairingCode pairing={pairing} onExpired={stopPairing} />
                <button className="chip" onClick={stopPairing}>
                  Отменить
                </button>
              </>
            ) : (
              <button className="chip accent" onClick={() => void startPairing()}>
                Показать код
              </button>
            )}
          </Row>
        )}
        {sync.enabled &&
          sync.devices.map((device) => (
            <Row key={device.id} title={device.name} hint={device.online ? 'В сети' : 'Не в сети'}>
              <button className="chip" onClick={() => window.api.syncForget(device.id)}>
                Забыть
              </button>
            </Row>
          ))}
      </Section>

      {discordAvailable && (
        <Section title="Интеграции" index={4}>
          <Row
            title="Статус в Discord"
            hint="В профиле Discord будет видно, что ты слушаешь, с обложкой и полоской времени. Нужен запущенный Discord."
          >
            <Switch
              label="Статус в Discord"
              checked={discord}
              onChange={(checked) => updateSettings({ discord: checked })}
            />
          </Row>
        </Section>
      )}

      <VoiceSection />

      <Section title="Мини-плеер" index={5}>
        <Row
          title="Поверх всех окон"
          hint="Обложка, трек и кнопки управления в маленькой карточке. Её можно перетащить мышью."
        >
          <Switch label="Мини-плеер" checked={miniVisible} onChange={toggleMini} />
        </Row>
        <Row title="Положение" hint="Выбор места возвращает карточку на него после перетаскивания.">
          <PositionPicker value={miniAnchor} onChange={setMiniAnchor} />
        </Row>
        <Row title="Прозрачность" hint="Фон карточки. Текст и кнопки остаются чёткими.">
          <RangeField
            label="Прозрачность мини-плеера"
            value={Math.round((1 - miniLook.opacity) * 100)}
            min={0}
            max={Math.round((1 - MINI_LIMITS.opacity.min) * 100)}
            format={(value) => `${value}%`}
            onChange={(value) => setMiniLook({ opacity: 1 - value / 100 })}
          />
        </Row>
        <Row title="Ширина">
          <RangeField
            label="Ширина мини-плеера"
            value={miniLook.width}
            min={MINI_LIMITS.width.min}
            max={MINI_LIMITS.width.max}
            format={(value) => `${value} px`}
            onChange={(value) => setMiniLook({ width: value })}
          />
        </Row>
        <Row title="Высота">
          <RangeField
            label="Высота мини-плеера"
            value={miniLook.height}
            min={MINI_LIMITS.height.min}
            max={MINI_LIMITS.height.max}
            format={(value) => `${value} px`}
            onChange={(value) => setMiniLook({ height: value })}
          />
        </Row>
        <Row
          title="Строка текста"
          hint="Стрелка внизу карточки открывает одну строчку текста под кнопками. Её можно включить и здесь."
        >
          <Switch
            label="Строка текста в мини-плеере"
            checked={miniLook.lyrics}
            onChange={(checked) => setMiniLook({ lyrics: checked })}
          />
        </Row>
        <Row title="Вернуть как было" hint="Стандартные размер и прозрачность.">
          <button
            className="chip"
            onClick={() =>
              setMiniLook({
                opacity: DEFAULT_MINI_LOOK.opacity,
                width: DEFAULT_MINI_LOOK.width,
                height: DEFAULT_MINI_LOOK.height
              })
            }
          >
            Сбросить
          </button>
        </Row>
      </Section>

      <CacheSection index={6} />

      <Section title="Горячие клавиши" index={7}>
        {shortcuts().map(([keys, action]) => (
          <div key={keys} className="setting-row shortcut">
            <kbd>{keys}</kbd>
            <span className="muted">{action}</span>
          </div>
        ))}
      </Section>

      <Section title="Аккаунт" index={8}>
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

      <AboutSection index={9} />

      <p className="muted small about">
        trashee — неофициальный клиент Яндекс Музыки. Он использует закрытое API сервиса, которое
        Яндекс может изменить.
      </p>
    </div>
  )
}
