import { HEIGHT_IN } from '../body'

/**
 * Turns tape measurements (inches) into the numbers the 3D mannequin is built
 * from. Anything not measured yet falls back to a typical value for the height,
 * so the model is always complete and sharpens as real numbers come in.
 */

export const DEFAULTS: Record<string, number> = {
  neck: 15.5,
  shoulders: 18,
  chest: 40,
  stomach: 34,
  bicep: 13,
  wrist: 7,
  sleeve: 33,
  jacketLength: 30,
  waist: 32,
  seat: 38,
  thigh: 22,
  inseam: 32,
  outseam: 41,
}

export type BodyParams = Record<keyof typeof DEFAULTS | 'height', number>

export function toParams(values: Record<string, number | undefined>): BodyParams {
  const p = { height: HEIGHT_IN } as BodyParams
  for (const [k, d] of Object.entries(DEFAULTS)) {
    const v = values[k]
    ;(p as Record<string, number>)[k] = v && v > 0 ? v : d
  }
  // Keep lengths physically sensible so a typo can't break the model.
  p.inseam = clamp(p.inseam, 24, 40)
  p.outseam = clamp(p.outseam, p.inseam + 5, p.inseam + 14)
  p.sleeve = clamp(p.sleeve, 26, 40)
  p.jacketLength = clamp(p.jacketLength, 22, 38)
  p.shoulders = clamp(p.shoulders, 14, 26)
  return p
}

export function lerpParams(a: BodyParams, b: BodyParams, t: number): BodyParams {
  const out = {} as BodyParams
  for (const k of Object.keys(b) as (keyof BodyParams)[]) out[k] = a[k] + (b[k] - a[k]) * t
  return out
}

export function paramsDistance(a: BodyParams, b: BodyParams): number {
  let d = 0
  for (const k of Object.keys(b) as (keyof BodyParams)[]) d = Math.max(d, Math.abs(a[k] - b[k]))
  return d
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

/** Radii of an ellipse with circumference `circ` and depth/width ratio `k` (Ramanujan). */
export function ellipseRadii(circ: number, k: number): { rx: number; rz: number } {
  const rx = circ / (Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k))))
  return { rx, rz: rx * k }
}
