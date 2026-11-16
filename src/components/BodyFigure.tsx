import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { MEASUREMENTS } from '../body'
import { FLOOR, buildFigure, smoothPath, type GuideGeom } from '../body2d/shape'
import { lerpParams, paramsDistance, toParams, type BodyParams } from '../body2d/params'

/**
 * Detailed front-view figure whose proportions come from the measurements.
 * Changing a value morphs the figure; a ghost outline can show another date.
 */

const VB = { x: -20, y: 0, w: 54, h: 74 }
const CALLOUT_MIN_X = 17.5

function useMorph(target: BodyParams): BodyParams {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)
  useEffect(() => {
    let raf = 0
    const step = () => {
      const cur = shownRef.current
      if (paramsDistance(cur, target) < 0.01) {
        shownRef.current = target
        setShown(target)
        return
      }
      const next = lerpParams(cur, target, 0.2)
      shownRef.current = next
      setShown(next)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return shown
}

function ringArcs(g: Extract<GuideGeom, { kind: 'ring' }>) {
  // Front half of the tape (toward the viewer) is the lower arc; back half dashed.
  const pts = (from: number, to: number) => {
    const out: [number, number][] = []
    const rad = (g.rot * Math.PI) / 180
    for (let i = 0; i <= 24; i++) {
      const a = from + ((to - from) * i) / 24
      const x = g.rx * Math.cos(a)
      const y = g.ry * Math.sin(a)
      out.push([g.cx + x * Math.cos(rad) - y * Math.sin(rad), g.cy + x * Math.sin(rad) + y * Math.cos(rad)])
    }
    return out
  }
  return { front: smoothPath(pts(0, Math.PI), false), back: smoothPath(pts(Math.PI, Math.PI * 2), false) }
}

function ticks(pts: [number, number][]) {
  const tick = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * 0.7
    const ny = (dx / len) * 0.7
    return `M${a[0] + nx} ${a[1] + ny} L${a[0] - nx} ${a[1] - ny}`
  }
  return tick(pts[0], pts[1]) + ' ' + tick(pts[pts.length - 1], pts[pts.length - 2])
}

function Guide({
  k,
  g,
  active,
  onSelect,
}: {
  k: string
  g: GuideGeom
  active: boolean
  onSelect: (k: string) => void
}) {
  const color = active ? 'stroke-indigo-600 dark:stroke-indigo-400' : 'stroke-slate-500/45 dark:stroke-slate-400/45'
  const w = active ? 0.34 : 0.17
  let visual: React.ReactNode
  let hitD: string
  if (g.kind === 'ring') {
    const { front, back } = ringArcs(g)
    hitD = front + ' ' + back
    visual = (
      <>
        <path d={back} fill="none" strokeWidth={w * 0.8} strokeDasharray="0.5 0.45" className={color} opacity={0.7} />
        <path d={front} fill="none" strokeWidth={w} strokeLinecap="round" className={color} />
      </>
    )
  } else {
    const line = smoothPath(g.pts, false)
    hitD = line
    visual = (
      <>
        <path d={line} fill="none" strokeWidth={w} strokeLinecap="round" className={color} strokeDasharray={active ? undefined : '0.9 0.5'} />
        {g.ticks && <path d={ticks(g.pts)} strokeWidth={w} strokeLinecap="round" className={color} />}
      </>
    )
  }
  return (
    <g>
      {visual}
      <path
        d={hitD}
        fill="none"
        stroke="transparent"
        strokeWidth={2.6}
        pointerEvents="stroke"
        className="cursor-pointer"
        onClick={() => onSelect(k)}
      />
    </g>
  )
}

export default function BodyFigure({
  values,
  ghostValues,
  selected,
  onSelect,
  label,
}: {
  values: Record<string, number | undefined>
  ghostValues?: Record<string, number | undefined> | null
  selected: string
  onSelect: (key: string) => void
  label: { title: string; value: string }
}) {
  const id = useId().replace(/:/g, '')
  const valuesKey = JSON.stringify(values)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const target = useMemo(() => toParams(values), [valuesKey])
  const shown = useMorph(target)
  const fig = useMemo(() => buildFigure(shown), [shown])

  const ghostKey = JSON.stringify(ghostValues ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ghost = useMemo(() => (ghostValues ? buildFigure(toParams(ghostValues)) : null), [ghostKey])

  const sel = fig.guides[selected]
  const order = MEASUREMENTS.map((m) => m.key).filter((k) => fig.guides[k])

  // Callout to the right of the figure, with a leader line from the guide.
  const anchor = sel?.anchor
  const calloutY = anchor ? Math.min(Math.max(anchor[1], 3), FLOOR - 3) : 0
  const calloutText = `${label.title}  ${label.value}`
  const calloutW = Math.max(9, calloutText.length * 1.05 + 2)
  const CALLOUT_X = Math.min(CALLOUT_MIN_X, VB.x + VB.w - 0.5 - calloutW)

  const feet = [1, 2, 3, 4, 5]

  return (
    <svg
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      className="mx-auto block w-full max-w-md select-none"
      role="group"
      aria-label="Body measurement figure"
    >
      <defs>
        <linearGradient id={`${id}skin`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="[stop-color:var(--color-slate-300)] dark:[stop-color:var(--color-slate-600)]" />
          <stop offset="0.35" className="[stop-color:var(--color-slate-100)] dark:[stop-color:var(--color-slate-500)]" />
          <stop offset="0.65" className="[stop-color:var(--color-slate-100)] dark:[stop-color:var(--color-slate-500)]" />
          <stop offset="1" className="[stop-color:var(--color-slate-300)] dark:[stop-color:var(--color-slate-600)]" />
        </linearGradient>
        <radialGradient id={`${id}floor`}>
          <stop offset="0" stopOpacity="0.22" className="[stop-color:var(--color-slate-500)]" />
          <stop offset="1" stopOpacity="0" className="[stop-color:var(--color-slate-500)]" />
        </radialGradient>
        {ghost && (
          <mask id={`${id}ghost`} maskUnits="userSpaceOnUse" x={VB.x} y={VB.y} width={VB.w} height={VB.h}>
            <g fill="white" stroke="white" strokeWidth={0.5} strokeLinejoin="round">
              {ghost.parts.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            <g fill="black">
              {ghost.parts.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          </mask>
        )}
      </defs>

      {/* Height ruler */}
      <g className="fill-slate-400 stroke-slate-300 dark:fill-slate-500 dark:stroke-slate-700" fontSize={1.6}>
        <line x1={-17} x2={-17} y1={FLOOR} y2={fig.headTop} strokeWidth={0.15} />
        {feet.map((f) => (
          <g key={f}>
            <line x1={-17.6} x2={-16.4} y1={FLOOR - f * 12} y2={FLOOR - f * 12} strokeWidth={0.15} />
            <text x={-18.1} y={FLOOR - f * 12 + 0.55} textAnchor="end" stroke="none">
              {f}′
            </text>
          </g>
        ))}
        <line x1={-17.9} x2={-16.1} y1={fig.headTop} y2={fig.headTop} strokeWidth={0.2} />
        <line x1={-16.1} x2={-3.5} y1={fig.headTop} y2={fig.headTop} strokeWidth={0.12} strokeDasharray="0.6 0.5" />
        <text x={-16.6} y={fig.headTop - 0.9} fontWeight={600} stroke="none" className="fill-slate-600 dark:fill-slate-300">
          5′10″
        </text>
      </g>

      {/* Floor shadow */}
      <ellipse cx={0} cy={FLOOR + 0.1} rx={9} ry={1.1} fill={`url(#${id}floor)`} />

      {/* Silhouette: outline pass then fill pass, so overlaps merge into one clean outline */}
      <g strokeLinejoin="round" className="fill-slate-400 stroke-slate-400 dark:fill-slate-400 dark:stroke-slate-400">
        {fig.ears.map((e, i) => (
          <ellipse key={i} cx={e.cx} cy={e.cy} rx={0.5} ry={1.15} strokeWidth={0.5} />
        ))}
        {fig.parts.map((d, i) => (
          <path key={i} d={d} strokeWidth={0.5} />
        ))}
      </g>
      <g fill={`url(#${id}skin)`}>
        {fig.ears.map((e, i) => (
          <ellipse key={i} cx={e.cx} cy={e.cy} rx={0.5} ry={1.15} />
        ))}
        {fig.parts.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* Arm edges over the torso, same weight as the silhouette outline */}
      <g fill="none" strokeLinecap="round" className="stroke-slate-400" strokeWidth={0.25}>
        {fig.contours.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>

      {/* Anatomy lines */}
      <g fill="none" strokeLinecap="round" className="stroke-slate-400/70 dark:stroke-slate-300/40" strokeWidth={0.14}>
        {fig.details.map((d, i) => (
          <path key={i} d={d} />
        ))}
        <ellipse cx={fig.navel[0]} cy={fig.navel[1]} rx={0.22} ry={0.32} />
      </g>

      {/* Ghost outline of another date */}
      {ghost && (
        <rect
          x={VB.x}
          y={VB.y}
          width={VB.w}
          height={VB.h}
          mask={`url(#${id}ghost)`}
          className="fill-orange-500 dark:fill-orange-400"
          opacity={0.95}
        />
      )}

      {/* Measurement guides (selected drawn last so it sits on top) */}
      {order
        .filter((k) => k !== selected)
        .map((k) => (
          <Guide key={k} k={k} g={fig.guides[k]} active={false} onSelect={onSelect} />
        ))}
      {sel && <Guide k={selected} g={sel} active onSelect={onSelect} />}

      {/* Callout */}
      {anchor && (
        <g pointerEvents="none">
          <polyline
            points={`${anchor[0] + 0.3},${anchor[1]} ${CALLOUT_X - 1.5},${calloutY} ${CALLOUT_X},${calloutY}`}
            fill="none"
            strokeWidth={0.15}
            className="stroke-indigo-600 dark:stroke-indigo-400"
          />
          <circle cx={anchor[0]} cy={anchor[1]} r={0.45} className="fill-indigo-600 dark:fill-indigo-400" />
          <rect
            x={CALLOUT_X}
            y={calloutY - 1.7}
            width={calloutW}
            height={3.4}
            rx={1.7}
            className="fill-slate-900 dark:fill-white"
          />
          <text x={CALLOUT_X + 1.1} y={calloutY + 0.6} fontSize={1.75} className="fill-white dark:fill-slate-900">
            <tspan fontWeight={600}>{label.title}</tspan>
            <tspan dx={0.8}>{label.value}</tspan>
          </text>
        </g>
      )}
    </svg>
  )
}
