import type { Measurement } from '../db'
import { MEASUREMENTS, fmtNum } from '../body'

/**
 * Front-view mannequin. Each measurement has a guide shape (a tape ellipse for
 * circumferences, a line for lengths) and a tappable dot. The selected one is
 * highlighted; the others show a faint guide so you can see where they are.
 */

type Guide =
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { type: 'line'; points: [number, number][] }

const GUIDES: Record<string, { guide: Guide; dot: [number, number] }> = {
  neck: { guide: { type: 'ellipse', cx: 100, cy: 70, rx: 11, ry: 3.5 }, dot: [111, 70] },
  shoulders: { guide: { type: 'line', points: [[57, 84], [143, 84]] }, dot: [143, 84] },
  chest: { guide: { type: 'ellipse', cx: 100, cy: 110, rx: 43, ry: 6 }, dot: [143, 110] },
  stomach: { guide: { type: 'ellipse', cx: 100, cy: 160, rx: 37.5, ry: 5 }, dot: [137.5, 160] },
  waist: { guide: { type: 'ellipse', cx: 100, cy: 192, rx: 36.5, ry: 5 }, dot: [136.5, 192] },
  seat: { guide: { type: 'ellipse', cx: 100, cy: 220, rx: 40, ry: 6 }, dot: [140, 220] },
  bicep: { guide: { type: 'ellipse', cx: 48, cy: 125, rx: 11, ry: 3.5 }, dot: [37, 125] },
  wrist: { guide: { type: 'ellipse', cx: 35, cy: 212, rx: 8, ry: 3 }, dot: [27, 212] },
  sleeve: { guide: { type: 'line', points: [[57, 86], [44, 155], [35, 212]] }, dot: [44, 155] },
  jacketLength: { guide: { type: 'line', points: [[100, 76], [100, 250]] }, dot: [100, 250] },
  thigh: { guide: { type: 'ellipse', cx: 80, cy: 252, rx: 15, ry: 4 }, dot: [65, 252] },
  inseam: { guide: { type: 'line', points: [[109, 236], [111, 392]] }, dot: [111, 330] },
  outseam: { guide: { type: 'line', points: [[136, 192], [134, 392]] }, dot: [134, 300] },
}

function GuideShape({ guide, active }: { guide: Guide; active: boolean }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: active ? 2.5 : 1.2,
    strokeDasharray: active ? undefined : '3 3',
    className: active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400/60 dark:text-slate-500/60',
  }
  if (guide.type === 'ellipse') return <ellipse cx={guide.cx} cy={guide.cy} rx={guide.rx} ry={guide.ry} {...common} />
  return <polyline points={guide.points.map((p) => p.join(',')).join(' ')} strokeLinecap="round" {...common} />
}

export default function BodyFigure({
  selected,
  onSelect,
  latest,
}: {
  selected: string
  onSelect: (key: string) => void
  latest: Record<string, Measurement>
}) {
  const sel = GUIDES[selected]

  return (
    <svg viewBox="10 20 180 385" className="mx-auto h-[400px] w-auto max-w-full select-none" role="group" aria-label="Body measurement map">
      {/* Mannequin */}
      <g className="fill-slate-200 stroke-slate-200 dark:fill-slate-700 dark:stroke-slate-700">
        <circle cx="100" cy="40" r="19" stroke="none" />
        <rect x="92" y="56" width="16" height="22" rx="4" stroke="none" />
        <path
          d="M60 80 Q100 71 140 80 L146 92 L138 150 Q134 175 136 200 L140 232 L60 232 L64 200 Q66 175 62 150 L54 92 Z"
          stroke="none"
        />
        <polyline points="57,90 44,158 35,220" fill="none" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="143,90 156,158 165,220" fill="none" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="80,226 79,310 79,392" fill="none" strokeWidth="27" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="120,226 121,310 121,392" fill="none" strokeWidth="27" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Faint guides for everything, strong guide for the selected one (drawn last = on top) */}
      {MEASUREMENTS.filter((m) => m.key !== selected).map((m) => (
        <GuideShape key={m.key} guide={GUIDES[m.key].guide} active={false} />
      ))}
      {sel && <GuideShape guide={sel.guide} active />}

      {/* Tap targets */}
      {MEASUREMENTS.map((m) => {
        const [x, y] = GUIDES[m.key].dot
        const active = m.key === selected
        const value = latest[m.key]?.value
        return (
          <g
            key={m.key}
            role="button"
            tabIndex={0}
            aria-label={`${m.label}${value ? `, ${fmtNum(value, 2)} inches` : ', not measured'}`}
            aria-pressed={active}
            onClick={() => onSelect(m.key)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(m.key)}
            className="cursor-pointer outline-none"
          >
            <circle cx={x} cy={y} r="11" fill="transparent" />
            <circle
              cx={x}
              cy={y}
              r={active ? 5.5 : 4}
              className={
                active
                  ? 'fill-indigo-600 stroke-white dark:fill-indigo-400 dark:stroke-slate-900'
                  : value
                    ? 'fill-slate-500 stroke-white dark:fill-slate-300 dark:stroke-slate-900'
                    : 'fill-white stroke-slate-400 dark:fill-slate-900 dark:stroke-slate-500'
              }
              strokeWidth="1.5"
            />
          </g>
        )
      })}
    </svg>
  )
}
