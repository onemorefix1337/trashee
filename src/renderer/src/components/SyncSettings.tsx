import { useEffect, useState, type JSX } from 'react'
import type { Pairing } from '../store/syncSettings'

const formatCountdown = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** The code to type on the phone, with the time it is good for. */
export function PairingCode({
  pairing,
  onExpired
}: {
  pairing: Pairing
  onExpired: () => void
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  const left = pairing.expiresAt - now
  useEffect(() => {
    if (left <= 0) onExpired()
  }, [left, onExpired])
  return (
    <div className="pairing">
      <div className="pairing-code" aria-label={`Код ${pairing.code.split('').join(' ')}`}>
        {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
      </div>
      <div className="muted small">
        Введи его в trashee на телефоне: «Настройки → Синхронизация». Действует{' '}
        {formatCountdown(left)}.
      </div>
      {pairing.addresses.length > 0 && (
        <div className="muted small">
          Если телефон не находит компьютер сам, введи адрес: {pairing.addresses.join(' или ')}
        </div>
      )}
    </div>
  )
}
