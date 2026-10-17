import type { JSX } from 'react'
import { motion } from 'motion/react'
import { EQ_BANDS, EQ_LIMIT_DB, EQ_PRESETS } from '../../../shared/settings'
import { updateSettings, useSettings } from '../store/settings'

const bandLabel = (hz: number): string => (hz >= 1000 ? `${hz / 1000}k` : String(hz))

/** Ten-band equalizer: presets on top, one vertical slider per frequency. */
export default function EqualizerPanel(): JSX.Element {
  const preset = useSettings((s) => s.eqPreset)
  const gains = useSettings((s) => s.eqGains)

  const setBand = (band: number, gain: number): void => {
    updateSettings({
      eqPreset: 'custom',
      eqGains: gains.map((current, i) => (i === band ? gain : current))
    })
  }

  return (
    <div className="eq-panel">
      <div className="eq-presets">
        {EQ_PRESETS.map((item) => (
          <motion.button
            key={item.id}
            className={`chip${preset === item.id ? ' on' : ''}`}
            onClick={() => updateSettings({ eqPreset: item.id, eqGains: item.gains })}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
          >
            {item.label}
          </motion.button>
        ))}
        {preset === 'custom' && <span className="chip static on">Свой</span>}
      </div>

      <div className="eq-bands">
        {EQ_BANDS.map((hz, band) => (
          <label key={hz} className="eq-band">
            <span className="eq-gain">{gains[band] > 0 ? `+${gains[band]}` : gains[band]}</span>
            <input
              type="range"
              className="eq-slider"
              min={-EQ_LIMIT_DB}
              max={EQ_LIMIT_DB}
              step={1}
              value={gains[band]}
              onChange={(event) => setBand(band, Number(event.target.value))}
              onDoubleClick={() => setBand(band, 0)}
              aria-label={`${hz} Гц`}
            />
            <span className="eq-hz">{bandLabel(hz)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
