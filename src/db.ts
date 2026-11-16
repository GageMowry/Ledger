import Dexie, { type EntityTable } from 'dexie'

/**
 * Everything the app stores lives in this IndexedDB database on the device.
 * New feature tables get added in later schema versions (db.version(2)...).
 */

export interface Setting {
  key: string
  value: unknown
}

export interface Task {
  id: number
  title: string
  notes?: string
  dueDate?: string // YYYY-MM-DD
  priority: 'low' | 'normal' | 'high'
  category?: string
  done: boolean
  createdAt: number
  completedAt?: number
}

/** Body weight (lbs) or a tape measurement (inches), one row per value per date. */
export interface Measurement {
  id: number
  metric: string // 'weight' or a key from MEASUREMENTS in body.ts
  date: string // YYYY-MM-DD
  value: number
  createdAt: number
}

/** Squat / bench in lbs, pull-ups in reps. */
export interface LiftEntry {
  id: number
  lift: 'squat' | 'bench' | 'pullups'
  date: string
  value: number
  createdAt: number
}

export interface Run {
  id: number
  date: string
  distanceMi: number
  durationSec: number
  notes?: string
  createdAt: number
}

/** A favorite recipe. Stored in the `meals` table. */
export interface Meal {
  id: number
  name: string
  servings?: number
  prepMin?: number
  cookMin?: number
  calories?: number // per serving
  protein?: number // grams per serving
  carbs?: number
  fat?: number
  ingredients: string[] // one line each, e.g. "1 lb chicken thighs"
  steps: string[]
  notes?: string
  source?: 'ai' | 'manual'
  createdAt: number
}

export type ClothingCategory = 'top' | 'bottom' | 'outerwear' | 'shoes' | 'accessory' | 'activewear'

export interface ClothingItem {
  id: number
  name: string
  category: ClothingCategory
  color?: string
  pattern?: string
  fit?: string
  description?: string
  photo?: Blob // small square JPEG thumbnail
  createdAt: number
  updatedAt: number
}

export interface Outfit {
  id: number
  name: string
  occasion?: string
  itemIds: number[]
  notes?: string
  source: 'ai' | 'manual'
  createdAt: number
}

export class LedgerDB extends Dexie {
  settings!: EntityTable<Setting, 'key'>
  tasks!: EntityTable<Task, 'id'>
  measurements!: EntityTable<Measurement, 'id'>
  lifts!: EntityTable<LiftEntry, 'id'>
  runs!: EntityTable<Run, 'id'>
  meals!: EntityTable<Meal, 'id'>
  clothes!: EntityTable<ClothingItem, 'id'>
  outfits!: EntityTable<Outfit, 'id'>

  constructor() {
    super('ledger')
    this.version(1).stores({
      settings: 'key',
      tasks: '++id, done, dueDate, priority, category, createdAt',
    })
    this.version(2).stores({
      measurements: '++id, metric, date, [metric+date]',
      lifts: '++id, lift, date, [lift+date]',
      runs: '++id, date',
    })
    this.version(3).stores({
      meals: '++id, name, createdAt',
      mealLogs: '++id, mealId, date, slot, [date+slot]',
    })
    // v4: daily meal log removed; meals are favorite recipes with steps.
    this.version(4)
      .stores({ mealLogs: null })
      .upgrade((tx) =>
        tx
          .table('meals')
          .toCollection()
          .modify((m: Record<string, unknown>) => {
            m.steps ??= []
            m.ingredients ??= []
            delete m.slots
            delete m.tags
            delete m.favorite
          }),
      )
    this.version(5).stores({
      clothes: '++id, category, createdAt',
      outfits: '++id, createdAt',
    })
  }
}

export const db = new LedgerDB()

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

/** Ask the browser not to evict our data when storage is low. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
