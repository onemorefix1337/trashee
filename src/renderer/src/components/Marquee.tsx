import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'

const SPEED_PX_PER_SECOND = 24
const MIN_SECONDS = 4

/** Text that scrolls back and forth when it does not fit its box. */
export default function Marquee({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(0)

  useEffect(() => {
    const outer = box.current
    const text = inner.current
    if (!outer || !text) return
    const measure = (): void => setOverflow(Math.max(0, text.scrollWidth - outer.clientWidth))
    // ResizeObserver reports the initial size too, and fires when the text changes.
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(text)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={box} className={`marquee${className ? ` ${className}` : ''}`}>
      <span
        ref={inner}
        className={overflow > 0 ? 'run' : undefined}
        style={
          overflow > 0
            ? {
                ['--shift' as string]: `-${overflow}px`,
                animationDuration: `${Math.max(MIN_SECONDS, overflow / SPEED_PX_PER_SECOND)}s`
              }
            : undefined
        }
      >
        {children}
      </span>
    </div>
  )
}
