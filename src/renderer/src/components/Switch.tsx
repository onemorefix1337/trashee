import type { JSX } from 'react'
import { motion } from 'motion/react'

export default function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <motion.span
        className="switch-knob"
        animate={{ x: checked ? 20 : 0 }}
        whileTap={{ scaleX: 1.3 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  )
}
