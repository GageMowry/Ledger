import { db, getSetting, setSetting, type Meal, type MealLog, type MealSlot } from './db'

export const SLOTS: { key: MealSlot; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
]

export interface FoodPrefs {
  likes: string[]
  dislikes: string[]
  avoid: string[] // allergies / restrictions
  notes: string
}

export interface NutritionTargets {
  enabled: boolean
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

export interface TimeLimit {
  enabled: boolean
  maxTotalMin: number // prep + cook
}

export const DEFAULT_PREFS: FoodPrefs = { likes: [], dislikes: [], avoid: [], notes: '' }
export const DEFAULT_TARGETS: NutritionTargets = { enabled: false }
export const DEFAULT_TIME: TimeLimit = { enabled: false, maxTotalMin: 30 }

export const getPrefs = () => getSetting<FoodPrefs>('foodPrefs', DEFAULT_PREFS)
export const getTargets = () => getSetting<NutritionTargets>('nutritionTargets', DEFAULT_TARGETS)
export const getTimeLimit = () => getSetting<TimeLimit>('mealTimeLimit', DEFAULT_TIME)
export const savePrefs = (p: FoodPrefs) => setSetting('foodPrefs', p)
export const saveTargets = (t: NutritionTargets) => setSetting('nutritionTargets', t)
export const saveTimeLimit = (t: TimeLimit) => setSetting('mealTimeLimit', t)

export function totalMin(m: Pick<Meal, 'prepMin' | 'cookMin'>): number | undefined {
  if (m.prepMin === undefined && m.cookMin === undefined) return undefined
  return (m.prepMin ?? 0) + (m.cookMin ?? 0)
}

export function fitsTime(m: Meal, limit: TimeLimit): boolean {
  if (!limit.enabled) return true
  const t = totalMin(m)
  return t === undefined || t <= limit.maxTotalMin
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

export interface MealStats {
  count: number
  lastDate?: string
  bySlot: Partial<Record<MealSlot, number>>
}

export function statsByMeal(logs: MealLog[]): Map<number, MealStats> {
  const out = new Map<number, MealStats>()
  for (const l of logs) {
    const s = out.get(l.mealId) ?? { count: 0, bySlot: {} }
    s.count += 1
    s.bySlot[l.slot] = (s.bySlot[l.slot] ?? 0) + 1
    if (!s.lastDate || l.date > s.lastDate) s.lastDate = l.date
    out.set(l.mealId, s)
  }
  return out
}

export type Macros = { calories: number; protein: number; carbs: number; fat: number }

export function dayTotals(logs: MealLog[], meals: Map<number, Meal>): Macros & { missing: number } {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0, missing: 0 }
  for (const l of logs) {
    const m = meals.get(l.mealId)
    if (!m || m.calories === undefined) t.missing += 1
    if (!m) continue
    t.calories += (m.calories ?? 0) * l.servings
    t.protein += (m.protein ?? 0) * l.servings
    t.carbs += (m.carbs ?? 0) * l.servings
    t.fat += (m.fat ?? 0) * l.servings
  }
  return t
}

/** Default slot for "now", so logging lands in the obvious place. */
export function slotForNow(): MealSlot {
  const h = new Date().getHours()
  if (h < 11) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export type MealInput = Omit<Meal, 'id' | 'createdAt'>

export async function saveMeal(input: MealInput, id?: number): Promise<number> {
  const clean: MealInput = {
    ...input,
    name: input.name.trim(),
    ingredients: input.ingredients.map((s) => s.trim()).filter(Boolean),
    tags: input.tags.map((s) => s.trim()).filter(Boolean),
    notes: input.notes?.trim() || undefined,
  }
  if (id) {
    await db.meals.update(id, clean)
    // Keep log names in sync with a renamed meal.
    await db.mealLogs.where('mealId').equals(id).modify({ name: clean.name })
    return id
  }
  return (await db.meals.add({ ...clean, createdAt: Date.now() } as Meal)) as number
}

export async function logMeal(meal: Meal, date: string, slot: MealSlot, servings = 1): Promise<void> {
  await db.mealLogs.add({ mealId: meal.id, name: meal.name, date, slot, servings, createdAt: Date.now() } as MealLog)
}
