import { useEffect, useRef, useState } from 'react'
import { friendlyDate } from '../dates'

export interface Point {
  date: string // YYYY-MM-DD
  value: number
}

const H = 150
const PAD = { top: 12, right: 12, bottom: 22, left: 40 }

function dayNum(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.05)
    min -= pad
    max += pad
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.999; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}

/**
 * Single-series line chart: 2px line, 8px markers, recessive grid, and a
 * tap/hover crosshair with a tooltip. Dates are spaced by real time.
 */
export default function LineChart({
  points,
  format,
  label,
}: {
  points: Point[]
  format: (v: number) => string
  label: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (points.length < 2) {
    return (
      <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        {points.length ? 'Log one more entry to see a trend.' : 'No entries yet.'}
      </p>
    )
  }

  const xs = points.map((p) => dayNum(p.date))
  const ticks = niceTicks(Math.min(...points.map((p) => p.value)), Math.max(...points.map((p) => p.value)))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const sx = (d: number) => PAD.left + (x1 === x0 ? innerW / 2 : ((d - x0) / (x1 - x0)) * innerW)
  const sy = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH
  const coords = points.map((p, i) => [sx(xs[i]), sy(p.value)] as const)

  function pick(clientX: number) {
    const rect = wrapRef.current!.getBoundingClientRect()
    const x = clientX - rect.left
    let best = 0
    coords.forEach(([cx], i) => {
      if (Math.abs(cx - x) < Math.abs(coords[best][0] - x)) best = i
    })
    setHover(best)
  }

  const h = hover !== null ? coords[hover] : null
  const tipLeft = h ? Math.min(Math.max(h[0], 60), width - 60) : 0

  return (
    <div ref={wrapRef} className="relative touch-pan-y">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={`${label} over time`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={sy(t)}
              y2={sy(t)}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={sy(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-400 text-[10px] dark:fill-slate-500"
            >
              {format(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 4} className="fill-slate-400 text-[10px] dark:fill-slate-500">
          {friendlyDate(points[0].date)}
        </text>
        <text x={width - PAD.right} y={H - 4} textAnchor="end" className="fill-slate-400 text-[10px] dark:fill-slate-500">
          {friendlyDate(points[points.length - 1].date)}
        </text>

        {h && (
          <line
            x1={h[0]}
            x2={h[0]}
            y1={PAD.top}
            y2={PAD.top + innerH}
            className="stroke-slate-300 dark:stroke-slate-600"
            strokeWidth="1"
          />
        )}
        <polyline
          points={coords.map((c) => c.join(',')).join(' ')}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-indigo-600 dark:stroke-indigo-400"
        />
        {coords.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={hover === i ? 5 : 4}
            strokeWidth="2"
            className="fill-indigo-600 stroke-white dark:fill-indigo-400 dark:stroke-slate-900"
          />
        ))}
      </svg>

      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow dark:bg-white dark:text-slate-900"
          style={{ left: tipLeft }}
        >
          <span className="font-semibold">{format(points[hover].value)}</span>
          <span className="opacity-70"> · {friendlyDate(points[hover].date)}</span>
        </div>
      )}
    </div>
  )
}
