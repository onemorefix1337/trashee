import type { JSX } from 'react'
import { motion } from 'motion/react'
import { MINI_ANCHORS, type MiniAnchor } from '../../../shared/mini'

const NAMES: Record<MiniAnchor, string> = {
  tl: 'Сверху слева',
  tc: 'Сверху по центру',
  tr: 'Сверху справа',
  bl: 'Снизу слева',
  bc: 'Снизу по центру',
  br: 'Снизу справа'
}

/** A tiny screen with six spots; the chosen one holds the card. */
export default function PositionPicker({
  value,
  onChange
}: {
  value: MiniAnchor
  onChange: (anchor: MiniAnchor) => void
}): JSX.Element {
  return (
    <div className="position-picker" role="radiogroup" aria-label="Положение мини-плеера">
      {MINI_ANCHORS.map((anchor) => (
        <button
          key={anchor}
          className="position-spot"
          role="radio"
          aria-checked={anchor === value}
          aria-label={NAMES[anchor]}
          title={NAMES[anchor]}
          onClick={() => onChange(anchor)}
        >
          {anchor === value && (
            <motion.span
              layoutId="position-card"
              className="position-card"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            />
          )}
        </button>
      ))}
    </div>
  )
}
