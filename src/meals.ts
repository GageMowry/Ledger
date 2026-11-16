import { db, getSetting, setSetting, type Meal } from './db'

export interface FoodPrefs {
  likes: string[]
  dislikes: string[]
  avoid: string[] // allergies / never
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

export const getPrefs = async (): Promise<FoodPrefs> => ({ ...DEFAULT_PREFS, ...(await getSetting<Partial<FoodPrefs>>('foodPrefs', {})) })
export const getTargets = () => getSetting<NutritionTargets>('nutritionTargets', DEFAULT_TARGETS)
export const getTimeLimit = () => getSetting<TimeLimit>('mealTimeLimit', DEFAULT_TIME)
export const getStaples = () => getSetting<string[]>('staples', [])

/** Kitchen equipment: a checklist of common items plus anything the user adds. */
export const COMMON_EQUIPMENT: { group: string; items: string[] }[] = [
  { group: 'Cooking', items: ['stove', 'oven', 'microwave', 'toaster', 'air fryer', 'toaster oven', 'grill', 'rice cooker', 'slow cooker', 'pressure cooker', 'sous vide'] },
  { group: 'Prep', items: ['blender', 'food processor', 'stand mixer', 'hand mixer', 'cheese grater', 'immersion blender', 'mandoline', 'kitchen scale', 'meat thermometer'] },
  { group: 'Pans & bakeware', items: ['cast iron skillet', 'dutch oven', 'wok', 'muffin tin', 'casserole dish', 'waffle maker'] },
]
export const DEFAULT_EQUIPMENT = ['microwave', 'oven', 'stove', 'toaster']
/** Assumed in every kitchen, so they aren't on the checklist. */
export const BASIC_TOOLS = 'knives, cutting board, mixing bowls, measuring cups and spoons, spatula, a pot, a skillet, a baking sheet'

export interface Equipment {
  have: string[] // what's available
  custom: string[] // user-added items not on the common list
}
export const getEquipment = async (): Promise<Equipment> => {
  const e = await getSetting<Equipment | null>('equipment', null)
  return e ?? { have: [...DEFAULT_EQUIPMENT], custom: [] }
}
export const saveEquipment = (e: Equipment) => setSetting('equipment', e)
export const isCommonEquipment = (name: string) =>
  COMMON_EQUIPMENT.some((g) => g.items.some((i) => i.toLowerCase() === name.trim().toLowerCase()))
export const savePrefs = (p: FoodPrefs) => setSetting('foodPrefs', p)
export const saveTargets = (t: NutritionTargets) => setSetting('nutritionTargets', t)
export const saveTimeLimit = (t: TimeLimit) => setSetting('mealTimeLimit', t)
export const saveStaples = (s: string[]) => setSetting('staples', s)

export function totalMin(m: Pick<Meal, 'prepMin' | 'cookMin'>): number | undefined {
  if (m.prepMin === undefined && m.cookMin === undefined) return undefined
  return (m.prepMin ?? 0) + (m.cookMin ?? 0)
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

/** Case-insensitive add, keeping the list sorted and free of duplicates. */
export function addTo(list: string[], items: string[]): string[] {
  const out = [...list]
  for (const raw of items) {
    const v = raw.trim()
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

export function removeFrom(list: string[], items: string[]): string[] {
  const drop = new Set(items.map((s) => s.trim().toLowerCase()))
  return list.filter((x) => !drop.has(x.toLowerCase()))
}

export type MealInput = Omit<Meal, 'id' | 'createdAt'>

export async function saveMeal(input: MealInput, id?: number): Promise<number> {
  const clean: MealInput = {
    ...input,
    name: input.name.trim(),
    ingredients: input.ingredients.map((s) => s.trim()).filter(Boolean),
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    notes: input.notes?.trim() || undefined,
  }
  if (id) {
    await db.meals.update(id, clean)
    return id
  }
  return (await db.meals.add({ ...clean, createdAt: Date.now() } as Meal)) as number
}
