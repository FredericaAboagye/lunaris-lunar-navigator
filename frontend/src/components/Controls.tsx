import type { Site } from '../api'
import { DURATIONS, MAX_SITES, SITE_COLORS } from '../lib'

type Props = {
  sites: Site[]
  selected: string[]
  onToggle: (id: string) => void
  start: string
  onStart: (value: string) => void
  days: number
  onDays: (value: number) => void
}

export default function Controls({
  sites,
  selected,
  onToggle,
  start,
  onStart,
  days,
  onDays,
}: Props) {
  const full = selected.length >= MAX_SITES

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
            ({selected.length}/{MAX_SITES})
          </span>
        </legend>
        {sites.map(site => {
          const index = selected.indexOf(site.id)
          const checked = index >= 0
          return (
            <div className="usa-checkbox" key={site.id}>
              <input
                className="usa-checkbox__input usa-checkbox__input--tile"
                id={`site-${site.id}`}
                type="checkbox"
                checked={checked}
                disabled={!checked && full}
                onChange={() => onToggle(site.id)}
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
                  {site.region}
                </span>
              </label>
            </div>
          )
        })}
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
          value={start}
          onChange={e => e.target.value && onStart(e.target.value)}
        />
      </div>

      <fieldset className="usa-fieldset">
        <legend className="usa-legend">Window length</legend>
        <ul className="usa-button-group usa-button-group--segmented">
          {DURATIONS.map(d => (
            <li className="usa-button-group__item" key={d.days}>
              <button
                type="button"
                className={
                  'usa-button' +
                  (d.days === days ? '' : ' usa-button--outline')
                }
                aria-pressed={d.days === days}
                onClick={() => onDays(d.days)}
              >
                {d.label}
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
    </form>
  )
}
