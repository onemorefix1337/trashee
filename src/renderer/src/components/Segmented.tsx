import { useId, type JSX } from 'react'
import { motion } from 'motion/react'

interface Option<T extends string | number> {
  value: T
  label: string
}

/** A row of options with a pill that slides to the selected one. */
export default function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label
}: {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}): JSX.Element {
  const pill = useId()
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={option.value === value}
          className={`seg${option.value === value ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.value === value && (
            <motion.span
              layoutId={pill}
              className="seg-pill"
              transition={{ type: 'spring', stiffness: 440, damping: 34 }}
            />
          )}
          <span className="seg-label">{option.label}</span>
        </button>
      ))}
    </div>
  )
}
