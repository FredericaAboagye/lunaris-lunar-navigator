import type { Mode, Site } from '../api'
import { DURATIONS, HEIGHTS, MAX_SITES, SITE_COLORS } from '../lib'

type Props = {
  sites: Site[]
  unsupported: Record<string, string>
  selected: string[]
  onToggle: (id: string) => void
  start: string
  onStart: (value: string) => void
  days: number
  onDays: (value: number) => void
  height: number
  onHeight: (value: number) => void
  mode: Mode
  onMode: (value: Mode) => void
}

function Segmented<T extends string | number>({
  legend,
  hint,
  options,
  value,
  onChange,
}: {
  legend: string
  hint?: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="usa-fieldset">
      <legend className="usa-legend">{legend}</legend>
      {hint && <span className="usa-hint">{hint}</span>}
      <ul className="usa-button-group usa-button-group--segmented">
        {options.map(o => (
          <li className="usa-button-group__item" key={String(o.value)}>
            <button
              type="button"
              className={
                'usa-button' +
                (o.value === value ? '' : ' usa-button--outline')
              }
              aria-pressed={o.value === value}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

export default function Controls(p: Props) {
  const full = p.selected.length >= MAX_SITES

  return (
    <form
      className="controls"
      aria-label="Mission configuration"
      onSubmit={e => e.preventDefault()}
    >
      <fieldset className="usa-fieldset">
        <legend className="usa-legend">
          Candidate sites{' '}
          <span className="muted">
            ({p.selected.length}/{MAX_SITES})
          </span>
        </legend>
        {p.sites.map(site => {
          const index = p.selected.indexOf(site.id)
          const checked = index >= 0
          return (
            <div className="usa-checkbox" key={site.id}>
              <input
                className="usa-checkbox__input usa-checkbox__input--tile"
                id={`site-${site.id}`}
                type="checkbox"
                checked={checked}
                disabled={!checked && full}
                onChange={() => p.onToggle(site.id)}
              />
              <label
                className="usa-checkbox__label"
                htmlFor={`site-${site.id}`}
              >
                <span className="site-option">
                  {checked && (
                    <span
                      className="swatch"
                      style={{ background: SITE_COLORS[index] }}
                      aria-hidden="true"
                    />
                  )}
                  {site.name}
                </span>
                <span className="usa-checkbox__label-description">
                  Terrain validated · {Math.abs(site.latitude).toFixed(2)}°S
                </span>
              </label>
            </div>
          )
        })}
        {Object.keys(p.unsupported).length > 0 && (
          <details className="unsupported">
            <summary>
              {Object.keys(p.unsupported).length} sites not available
            </summary>
            <ul>
              {Object.entries(p.unsupported).map(([id, why]) => (
                <li key={id}>{why}</li>
              ))}
            </ul>
          </details>
        )}
      </fieldset>

      <div>
        <label className="usa-label" htmlFor="start">
          Start date (UTC)
        </label>
        <input
          className="usa-input"
          id="start"
          type="date"
          min="2000-01-01"
          max="2049-01-01"
          value={p.start}
          onChange={e => e.target.value && p.onStart(e.target.value)}
        />
      </div>

      <Segmented
        legend="Window length"
        options={DURATIONS.map(d => ({ value: d.days, label: d.label }))}
        value={p.days}
        onChange={p.onDays}
      />

      <Segmented
        legend="Observer height"
        hint="Height of the solar panel or antenna above the ground"
        options={HEIGHTS.map(h => ({ value: h, label: `${h} m` }))}
        value={p.height}
        onChange={p.onHeight}
      />

      <Segmented<Mode>
        legend="Horizon model"
        options={[
          { value: 'terrain', label: 'LOLA terrain' },
          { value: 'geometric', label: 'Smooth sphere' },
        ]}
        value={p.mode}
        onChange={p.onMode}
      />
    </form>
  )
}
