import { db, type LiftEntry, type Measurement } from './db'
import { todayISO } from './dates'

export const HEIGHT_IN = 70 // 5'10", fixed

export type MeasureKind = 'circ' | 'length'

export interface MeasureDef {
  key: string
  label: string
  group: 'Jacket & shirt' | 'Pants'
  kind: MeasureKind
  how: string
}

/** Tailoring measurements, all in inches. Order = display order. */
export const MEASUREMENTS: MeasureDef[] = [
  { key: 'neck', label: 'Neck', group: 'Jacket & shirt', kind: 'circ', how: 'Around the base of the neck where a collar sits, one finger under the tape.' },
  { key: 'shoulders', label: 'Shoulders', group: 'Jacket & shirt', kind: 'length', how: 'Across the back from the tip of one shoulder bone to the other.' },
  { key: 'chest', label: 'Chest', group: 'Jacket & shirt', kind: 'circ', how: 'Around the fullest part of the chest, under the arms, tape level.' },
  { key: 'stomach', label: 'Stomach', group: 'Jacket & shirt', kind: 'circ', how: 'Around the widest part of the stomach, usually at the navel.' },
  { key: 'bicep', label: 'Bicep', group: 'Jacket & shirt', kind: 'circ', how: 'Around the widest part of the upper arm, relaxed.' },
  { key: 'wrist', label: 'Wrist', group: 'Jacket & shirt', kind: 'circ', how: 'Around the wrist just above the wrist bone.' },
  { key: 'sleeve', label: 'Sleeve', group: 'Jacket & shirt', kind: 'length', how: 'From the shoulder seam point down the outside of the arm to the wrist bone.' },
  { key: 'jacketLength', label: 'Jacket length', group: 'Jacket & shirt', kind: 'length', how: 'From the base of the collar at the back down to where you want the jacket hem.' },
  { key: 'waist', label: 'Waist', group: 'Pants', kind: 'circ', how: 'Around where your pants sit, usually just above the hip bones.' },
  { key: 'seat', label: 'Seat', group: 'Pants', kind: 'circ', how: 'Around the fullest part of the hips and seat, feet together.' },
  { key: 'thigh', label: 'Thigh', group: 'Pants', kind: 'circ', how: 'Around the top of the thigh, just below the crotch.' },
  { key: 'inseam', label: 'Inseam', group: 'Pants', kind: 'length', how: 'From the crotch down the inside of the leg to where the pants should end.' },
  { key: 'outseam', label: 'Outseam', group: 'Pants', kind: 'length', how: 'From the top of the waistband down the outside of the leg to the hem.' },
]

export const MEASURE_BY_KEY = Object.fromEntries(MEASUREMENTS.map((m) => [m.key, m])) as Record<string, MeasureDef>

export const LIFTS: { key: LiftEntry['lift']; label: string; unit: 'lbs' | 'reps' }[] = [
  { key: 'squat', label: 'Squat', unit: 'lbs' },
  { key: 'bench', label: 'Bench', unit: 'lbs' },
  { key: 'pullups', label: 'Pull-ups', unit: 'reps' },
]

export function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

export function fmtNum(n: number, maxDecimals = 1): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals })
}

/** Latest value per metric (by date, then entry time). */
export function latestByMetric(rows: Measurement[]): Record<string, Measurement> {
  const out: Record<string, Measurement> = {}
  for (const r of rows) {
    const cur = out[r.metric]
    if (!cur || r.date > cur.date || (r.date === cur.date && r.createdAt > cur.createdAt)) out[r.metric] = r
  }
  return out
}

export function sortByDate<T extends { date: string; createdAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
}

export async function addMeasurements(values: Record<string, number>, date = todayISO()): Promise<void> {
  const now = Date.now()
  const rows = Object.entries(values)
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .map(([metric, value]) => ({ metric, value, date, createdAt: now }) as Measurement)
  if (rows.length) await db.measurements.bulkAdd(rows)
}

export async function addLift(lift: LiftEntry['lift'], value: number, date = todayISO()): Promise<void> {
  await db.lifts.add({ lift, value, date, createdAt: Date.now() } as LiftEntry)
}

/** BMI from weight (lbs) and the fixed height. */
export function bmi(weightLbs: number): number {
  return (703 * weightLbs) / (HEIGHT_IN * HEIGHT_IN)
}

/** Rough off-the-rack sizes from the latest measurements. */
export function suggestedSizes(latest: Record<string, Measurement>): { label: string; value: string }[] {
  const v = (k: string) => latest[k]?.value
  const out: { label: string; value: string }[] = []
  const chest = v('chest')
  if (chest) {
    // Jacket size ≈ chest rounded to the nearest even inch; 5'8"–5'11" is Regular.
    const size = Math.round(chest / 2) * 2
    const len = HEIGHT_IN < 68 ? 'S' : HEIGHT_IN <= 71 ? 'R' : 'L'
    out.push({ label: 'Suit jacket', value: `${size}${len}` })
  }
  const neck = v('neck')
  const sleeve = v('sleeve')
  if (neck) {
    const n = Math.round(neck * 2) / 2
    out.push({ label: 'Dress shirt', value: sleeve ? `${fmtNum(n)} / ${Math.round(sleeve)}` : `${fmtNum(n)} neck` })
  }
  const waist = v('waist')
  const inseam = v('inseam')
  if (waist) {
    out.push({ label: 'Pants', value: inseam ? `${Math.round(waist)} × ${Math.round(inseam)}` : `${Math.round(waist)} waist` })
  }
  return out
}

/** Runs */
export function parseDuration(text: string): number | null {
  // Accepts "mm:ss", "h:mm:ss" or plain minutes ("25").
  const parts = text.trim().split(':').map((p) => p.trim())
  if (!parts.length || parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.length === 1) return Math.round(nums[0] * 60)
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  return null
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Pace in seconds per mile. */
export function pace(distanceMi: number, durationSec: number): number {
  return durationSec / distanceMi
}
