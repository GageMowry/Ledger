import { getSetting, setSetting } from './db'
import { chatJSON, type ChatTurn } from './gemini'
import {
  addTo,
  formatMinutes,
  getPrefs,
  getStaples,
  removeFrom,
  saveMeal,
  savePrefs,
  saveStaples,
  type FoodPrefs,
  type MealInput,
} from './meals'
import type { MealsData } from './useMealsData'

/** Shape Gemini must answer in (enforced by the response schema below). */
export interface MakerRecipe {
  name: string
  servings: number
  prepMin: number
  cookMin: number
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  ingredients: { amount: string; item: string; fromStaples: boolean }[]
  steps: string[]
  tips?: string
}

export interface ListUpdates {
  addLikes?: string[]
  addDislikes?: string[]
  addAllergies?: string[]
  removeLikes?: string[]
  removeDislikes?: string[]
  removeAllergies?: string[]
  addStaples?: string[]
  removeStaples?: string[]
}

export interface MakerReply {
  reply: string
  recipe?: MakerRecipe | null
  updates?: ListUpdates | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'model'
  text: string // user prompt, or the model's reply text
  reply?: MakerReply
  applied?: ListUpdates // what actually changed, for undo
  undone?: boolean
  savedMealId?: number
  error?: boolean
}

const STR = { type: 'STRING' }
const INT = { type: 'INTEGER' }
const STR_LIST = { type: 'ARRAY', items: STR }

export const REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { ...STR, description: 'Short conversational answer, 1-3 sentences. No recipe text here.' },
    recipe: {
      type: 'OBJECT',
      nullable: true,
      description: 'A full recipe when the user wants something to cook; otherwise null.',
      properties: {
        name: STR,
        servings: INT,
        prepMin: INT,
        cookMin: INT,
        calories: { ...INT, nullable: true, description: 'Estimated per serving' },
        protein: { ...INT, nullable: true, description: 'Grams per serving' },
        carbs: { ...INT, nullable: true },
        fat: { ...INT, nullable: true },
        ingredients: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              amount: { ...STR, description: 'US units, e.g. "1 lb", "2 tbsp", "1"' },
              item: STR,
              fromStaples: { type: 'BOOLEAN', description: 'True if this comes from the staples list' },
            },
            required: ['amount', 'item', 'fromStaples'],
          },
        },
        steps: { ...STR_LIST, description: 'Clear numbered-style instructions, one action each, with times and heat levels' },
        tips: { ...STR, nullable: true },
      },
      required: ['name', 'servings', 'prepMin', 'cookMin', 'ingredients', 'steps'],
    },
    updates: {
      type: 'OBJECT',
      nullable: true,
      description: 'Changes to the user\'s saved lists, only when the user stated or confirmed them.',
      properties: {
        addLikes: STR_LIST,
        addDislikes: STR_LIST,
        addAllergies: STR_LIST,
        removeLikes: STR_LIST,
        removeDislikes: STR_LIST,
        removeAllergies: STR_LIST,
        addStaples: STR_LIST,
        removeStaples: STR_LIST,
      },
    },
  },
  required: ['reply'],
}

const list = (xs: string[]) => (xs.length ? xs.join(', ') : '(none yet)')

export function buildSystemPrompt(d: MealsData): string {
  const t = d.targets
  const targetLine = t.enabled
    ? [t.calories && `${t.calories} calories`, t.protein && `${t.protein}g protein`, t.carbs && `${t.carbs}g carbs`, t.fat && `${t.fat}g fat`]
        .filter(Boolean)
        .join(', ')
    : ''
  return `You are the Meal Maker in a personal app. You help one person (a 5'10" man) decide what to cook and you write clear, reliable recipes.

KITCHEN STAPLES (always on hand): ${list(d.staples)}
LIKES: ${list(d.prefs.likes)}
DISLIKES (avoid unless asked): ${list(d.prefs.dislikes)}
ALLERGIES / NEVER (must never appear in a recipe): ${list(d.prefs.avoid)}
OTHER NOTES: ${d.prefs.notes.trim() || '(none)'}
DAILY TARGETS: ${targetLine || '(not tracking)'}${targetLine ? ' — size a single meal at roughly a third of these unless told otherwise.' : ''}
TIME LIMIT: ${d.timeLimit.enabled ? `total prep + cook must be at most ${formatMinutes(d.timeLimit.maxTotalMin)} unless the user asks for longer.` : 'none'}
SAVED FAVORITES: ${list(d.meals.map((m) => m.name))}

How to answer:
- Always fill "reply" with a short, friendly 1-3 sentence answer. Never put the recipe text in "reply".
- When the user wants something to eat or cook, return ONE complete recipe in "recipe". Build it around the staples first; set fromStaples true for those ingredients and false for anything they'd need to buy. Keep extra purchases to a minimum and mention them in "reply".
- Use US units. Estimate calories and macros per serving. Steps must be specific (heat level, times, doneness cues).
- If the user is only chatting or answering questions, set "recipe" to null.
- Default to 1-2 servings unless asked. Avoid repeating a saved favorite unless asked for it.

Preference skill:
- When the user states a like, dislike, allergy, or something they always keep or ran out of, record it in "updates" (addLikes, addDislikes, addAllergies, addStaples, removeStaples, etc.). Use short lowercase food names. Don't repeat items already on a list.
- If the user asks you to build out or fill in their preferences, interview them: ask 2-4 quick, specific questions per turn (proteins, vegetables, cuisines, spice level, textures, allergies, what's always in the kitchen), and record their answers in "updates" on the next turn. Keep going until they say stop.
- Never add something the user didn't say or confirm.`
}

/** Model turns are replayed as their JSON so the model sees its own past structure. */
export function toTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((m) => !m.error)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.role === 'model' && m.reply ? JSON.stringify(m.reply) : m.text }],
    }))
}

export async function askMealMaker(data: MealsData, history: ChatMessage[], prompt: string): Promise<MakerReply> {
  const turns = [...toTurns(history.slice(-16)), { role: 'user' as const, parts: [{ text: prompt }] }]
  const r = await chatJSON<MakerReply>(buildSystemPrompt(data), turns, REPLY_SCHEMA)
  if (typeof r?.reply !== 'string') throw new Error('Gemini sent a reply in an unexpected format. Try again.')
  return r
}

/** Applies list changes and returns exactly what changed (for display and undo). */
export async function applyUpdates(u: ListUpdates | null | undefined): Promise<ListUpdates | undefined> {
  if (!u) return undefined
  const prefs = await getPrefs()
  const staples = await getStaples()
  const applied: ListUpdates = {}
  const diffAdd = (before: string[], after: string[]) => after.filter((x) => !before.some((b) => b.toLowerCase() === x.toLowerCase()))
  const diffRemove = (before: string[], after: string[]) => before.filter((x) => !after.includes(x))

  const next: FoodPrefs = { ...prefs }
  const step = (key: 'likes' | 'dislikes' | 'avoid', add?: string[], remove?: string[], addKey?: keyof ListUpdates, removeKey?: keyof ListUpdates) => {
    const before = next[key]
    let after = add?.length ? addTo(before, add) : before
    after = remove?.length ? removeFrom(after, remove) : after
    const a = diffAdd(before, after)
    const r = diffRemove(before, after)
    if (a.length && addKey) applied[addKey] = a
    if (r.length && removeKey) applied[removeKey] = r
    next[key] = after
  }
  step('likes', u.addLikes, u.removeLikes, 'addLikes', 'removeLikes')
  step('dislikes', u.addDislikes, u.removeDislikes, 'addDislikes', 'removeDislikes')
  step('avoid', u.addAllergies, u.removeAllergies, 'addAllergies', 'removeAllergies')

  let nextStaples = u.addStaples?.length ? addTo(staples, u.addStaples) : staples
  nextStaples = u.removeStaples?.length ? removeFrom(nextStaples, u.removeStaples) : nextStaples
  const sa = diffAdd(staples, nextStaples)
  const sr = diffRemove(staples, nextStaples)
  if (sa.length) applied.addStaples = sa
  if (sr.length) applied.removeStaples = sr

  if (!Object.keys(applied).length) return undefined
  await savePrefs(next)
  if (sa.length || sr.length) await saveStaples(nextStaples)
  return applied
}

/** Reverses a previously applied change set. */
export async function undoUpdates(a: ListUpdates): Promise<void> {
  await applyUpdates({
    addLikes: a.removeLikes,
    removeLikes: a.addLikes,
    addDislikes: a.removeDislikes,
    removeDislikes: a.addDislikes,
    addAllergies: a.removeAllergies,
    removeAllergies: a.addAllergies,
    addStaples: a.removeStaples,
    removeStaples: a.addStaples,
  })
}

export function describeUpdates(a: ListUpdates): string[] {
  const out: string[] = []
  const push = (verb: string, list: string, xs?: string[]) => xs?.length && out.push(`${verb} ${list}: ${xs.join(', ')}`)
  push('Added to', 'Likes', a.addLikes)
  push('Added to', 'Dislikes', a.addDislikes)
  push('Added to', 'Allergies', a.addAllergies)
  push('Added to', 'Staples', a.addStaples)
  push('Removed from', 'Likes', a.removeLikes)
  push('Removed from', 'Dislikes', a.removeDislikes)
  push('Removed from', 'Allergies', a.removeAllergies)
  push('Removed from', 'Staples', a.removeStaples)
  return out
}

export function recipeToMeal(r: MakerRecipe): MealInput {
  return {
    name: r.name,
    servings: r.servings || undefined,
    prepMin: r.prepMin ?? undefined,
    cookMin: r.cookMin ?? undefined,
    calories: r.calories ?? undefined,
    protein: r.protein ?? undefined,
    carbs: r.carbs ?? undefined,
    fat: r.fat ?? undefined,
    ingredients: r.ingredients.map((i) => `${i.amount} ${i.item}`.trim()),
    steps: r.steps,
    notes: r.tips ?? undefined,
    source: 'ai',
  }
}

export const saveRecipe = (r: MakerRecipe) => saveMeal(recipeToMeal(r))

/** The conversation is kept on the device so it survives closing the app. */
export const loadChat = () => getSetting<ChatMessage[]>('mealChat', [])
export const saveChat = (m: ChatMessage[]) => setSetting('mealChat', m.slice(-60))
