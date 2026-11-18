import { db, getSetting, setSetting, type Meal } from './db'
import { HEIGHT_IN, formatHeight } from './body'
import { chatJSON, chatJSONWithSearch, partialStringField, type ChatTurn, type WebSource } from './gemini'
import {
  addTo,
  formatMinutes,
  getPrefs,
  getStaples,
  getStaplesOut,
  saveStaplesOut,
  getTargets,
  getTimeLimit,
  removeFrom,
  saveMeal,
  savePrefs,
  saveStaples,
  saveTargets,
  saveTimeLimit,
  saveEquipment,
  getEquipment,
  isCommonEquipment,
  BASIC_TOOLS,
  type Equipment,
  type FoodPrefs,
  type MealInput,
  type NutritionTargets,
  type TimeLimit,
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
  markOut?: string[] // staples the user ran out of
  markBack?: string[] // staples back in stock
  addEquipment?: string[]
  removeEquipment?: string[]
  // Settings the Meal Maker may change when asked.
  timeLimitMin?: number | null // > 0 sets and turns on the limit; 0 turns it off
  notes?: string | null // full replacement for "Other notes"
  targets?: { enabled?: boolean | null; calories?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null } | null
  // Filled in by applyUpdates so the change can be shown and undone.
  settingsChange?: SettingsChange
}

export interface SettingsChange {
  prevTimeLimit?: TimeLimit
  nextTimeLimit?: TimeLimit
  prevNotes?: string
  nextNotes?: string
  prevTargets?: NutritionTargets
  nextTargets?: NutritionTargets
}

export interface MacroEstimate {
  servings?: number | null
  calories: number
  protein: number
  carbs: number
  fat: number
  basis?: string | null
}

export interface MakerReply {
  reply: string
  recipe?: MakerRecipe | null
  updates?: ListUpdates | null
  macroEstimate?: MacroEstimate | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'model'
  text: string // what the chat shows: user prompt, or the model's reply text
  prompt?: string // full text sent to the model when it differs from `text`
  estimateFor?: number // favorite this macro-estimate conversation is about
  reply?: MakerReply
  applied?: ListUpdates // what actually changed, for undo
  undone?: boolean
  savedMealId?: number
  estimateSaved?: boolean
  error?: boolean
  searched?: boolean // user message sent with Web on
  sources?: WebSource[]
}

const STR = { type: 'STRING' }
const INT = { type: 'INTEGER' }
const STR_LIST = { type: 'ARRAY', items: STR }

export const REPLY_SCHEMA = {
  type: 'OBJECT',
  // "reply" is written first so it can be shown while the rest is still streaming.
  propertyOrdering: ['reply', 'recipe', 'macroEstimate', 'updates'],
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
    macroEstimate: {
      type: 'OBJECT',
      nullable: true,
      description: 'Per-serving nutrition estimate for a recipe the user asked about; null while asking follow-up questions.',
      properties: {
        servings: { ...INT, nullable: true },
        calories: INT,
        protein: { ...INT, description: 'grams' },
        carbs: { ...INT, description: 'grams' },
        fat: { ...INT, description: 'grams' },
        basis: { ...STR, nullable: true, description: 'One short line on the assumptions used' },
      },
      required: ['calories', 'protein', 'carbs', 'fat'],
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
        removeStaples: { ...STR_LIST, description: 'Staples the user no longer wants to keep at all' },
        markOut: { ...STR_LIST, description: 'Staples the user ran out of for now (stay on the list, marked out)' },
        markBack: { ...STR_LIST, description: 'Staples the user restocked / bought again' },
        addEquipment: { ...STR_LIST, description: 'Kitchen tools/appliances the user says they have, lowercase (e.g. "air fryer")' },
        removeEquipment: { ...STR_LIST, description: 'Kitchen tools/appliances the user says they no longer have' },
        timeLimitMin: {
          ...INT,
          nullable: true,
          description: 'New max total prep + cook minutes (5-240). 0 turns the time limit off. Only when the user asks.',
        },
        notes: {
          ...STR,
          nullable: true,
          description: 'Full new text for "Other notes". Keep the existing notes and add to them unless the user wants them replaced.',
        },
        targets: {
          type: 'OBJECT',
          nullable: true,
          description: 'Daily targets to change. Include only the fields the user asked about. enabled false turns targets off.',
          properties: {
            enabled: { type: 'BOOLEAN', nullable: true },
            calories: { ...INT, nullable: true },
            protein: { ...INT, nullable: true, description: 'grams' },
            carbs: { ...INT, nullable: true, description: 'grams' },
            fat: { ...INT, nullable: true, description: 'grams' },
          },
        },
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
  const outSet = new Set(d.staplesOut)
  const inStock = d.staples.filter((s) => !outSet.has(s.toLowerCase()))
  const ranOut = d.staples.filter((s) => outSet.has(s.toLowerCase()))
  return `You are the Meal Maker in a personal app. You help one person (a ${formatHeight(HEIGHT_IN)} man) decide what to cook and you write clear, reliable recipes.

KITCHEN STAPLES (on hand now): ${list(inStock)}${
    ranOut.length
      ? `\nRAN OUT (normally kept, missing right now): ${ranOut.join(', ')}. Don't count on these: prefer recipes without them; if one is truly needed, set fromStaples false and mention in "reply" that he's out of it.`
      : ''
  }
KITCHEN EQUIPMENT AVAILABLE: ${list(d.equipment.have)}; plus basics: ${BASIC_TOOLS}.
EQUIPMENT RULE: only use cooking methods and tools from that equipment list and the basics. If something they don't have would help (e.g. no air fryer, no blender), adapt the method to what they do have. If a request truly needs missing equipment, say so in "reply" and offer an alternative.
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

Macro estimate skill:
- When asked to estimate the macros of a recipe, first check whether anything that changes the numbers a lot is unclear: portion or serving size, cut of meat (skin on/off, lean %), how much oil/butter, sauces, whether rice/pasta amounts are dry or cooked. If so, ask up to 3 short, specific follow-up questions in "reply" and set "macroEstimate" to null.
- Once you have enough (or the user says to just estimate), return "macroEstimate" per serving: calories, protein, carbs, fat as whole numbers, plus a one-line "basis" naming the key assumptions. Keep "recipe" null for estimates. Only these four values; don't list other nutrients.

Settings skill:
- The user can ask you to change their max cook + prep time, their "other notes", or their daily calorie/macro targets. Put the change in "updates": timeLimitMin (0 turns the limit off), notes (the full new notes text; keep what's there and add to it unless told to replace), targets (only the fields they mentioned; enabled false turns targets off).
- Only change these when the user asks or clearly confirms, and say what you changed in "reply". If they ask for a target without a number (e.g. "set my calories for a cut"), suggest a number and ask them to confirm before setting it.

Preference skill:
- When the user states a like, dislike, allergy, something they always keep, or a kitchen tool they got or no longer have, record it in "updates" (addLikes, addDislikes, addAllergies, addStaples, removeStaples, addEquipment, removeEquipment, etc.).
- "I ran out of X" / "I'm out of X" for a staple → markOut (not removeStaples). "I bought / restocked X" → markBack. removeStaples is only for things he won't keep anymore. Use short lowercase food names. Don't repeat items already on a list.
- If the user asks you to build out or fill in their preferences, interview them: ask 2-4 quick, specific questions per turn (proteins, vegetables, cuisines, spice level, textures, allergies, what's always in the kitchen), and record their answers in "updates" on the next turn. Keep going until they say stop.
- Never add something the user didn't say or confirm.`
}

/** Model turns are replayed as their JSON so the model sees its own past structure. */
export function toTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((m) => !m.error)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.role === 'model' && m.reply ? JSON.stringify(m.reply) : (m.prompt ?? m.text) }],
    }))
}

/** The message sent when "Estimate macros" is tapped on a favorite. */
export function estimatePrompt(m: Meal): string {
  const lines = [
    `Estimate the calories and macros per serving for my saved recipe "${m.name}"${m.servings ? ` (serves ${m.servings})` : ' (servings not set)'}.`,
    'Ingredients:',
    ...(m.ingredients.length ? m.ingredients.map((i) => `- ${i}`) : ['- (none listed)']),
  ]
  if (m.steps.length) lines.push('Steps:', ...m.steps.map((s, i) => `${i + 1}. ${s}`))
  if (m.notes) lines.push(`Notes: ${m.notes}`)
  lines.push('Ask me follow-up questions first if anything important is unclear.')
  return lines.join('\n')
}

/** Which favorite a reply's estimate belongs to: the nearest earlier estimate request. */
export function estimateTarget(messages: ChatMessage[], index: number): number | undefined {
  for (let i = index; i >= 0; i--) if (messages[i].estimateFor) return messages[i].estimateFor
  return undefined
}

export async function saveEstimate(mealId: number, e: MacroEstimate): Promise<void> {
  await db.meals.update(mealId, {
    calories: e.calories,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
    ...(e.servings ? { servings: e.servings } : {}),
  })
}

export async function askMealMaker(
  data: MealsData,
  history: ChatMessage[],
  prompt: string,
  opts?: { search?: boolean; /** Gets the reply sentence as it is being written. */ onReply?: (soFar: string) => void },
): Promise<{ reply: MakerReply; sources?: WebSource[] }> {
  const past = toTurns(history.slice(-16))
  while (past[0]?.role === 'model') past.shift() // a conversation sent to Gemini starts with the user
  const turns = [...past, { role: 'user' as const, parts: [{ text: prompt }] }]
  const system = buildSystemPrompt(data)
  const onReply = opts?.onReply
  const onPartial = onReply
    ? (json: string) => {
        const soFar = partialStringField(json, 'reply')
        if (soFar) onReply(soFar)
      }
    : undefined
  let r: MakerReply
  let sources: WebSource[] | undefined
  if (opts?.search) {
    const out = await chatJSONWithSearch<MakerReply>(system, turns, REPLY_SCHEMA, onPartial)
    r = out.result
    sources = out.sources
  } else {
    r = await chatJSON<MakerReply>(system, turns, REPLY_SCHEMA, onPartial)
  }
  if (typeof r?.reply !== 'string') throw new Error('Gemini sent a reply in an unexpected format. Try again.')
  return { reply: r, sources }
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
  type ListKey = 'addLikes' | 'addDislikes' | 'addAllergies' | 'removeLikes' | 'removeDislikes' | 'removeAllergies'
  const step = (key: 'likes' | 'dislikes' | 'avoid', add?: string[], remove?: string[], addKey?: ListKey, removeKey?: ListKey) => {
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

  // ---- Ran out / restocked (only for things on the staples list) ----
  const out = await getStaplesOut()
  const onList = (x: string) => nextStaples.some((s) => s.toLowerCase() === x)
  const lc = (xs?: string[]) => [...new Set((xs ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))]
  const markOut = lc(u.markOut).filter((x) => onList(x) && !out.includes(x))
  // Restocked, newly added, or removed staples are no longer "out".
  const clear = new Set([...lc(u.markBack), ...lc(sa), ...lc(sr)])
  const markBack = out.filter((x) => clear.has(x) && !markOut.includes(x))
  if (markOut.length) applied.markOut = markOut
  if (lc(u.markBack).length) {
    const shown = markBack.filter((x) => lc(u.markBack).includes(x))
    if (shown.length) applied.markBack = shown
  }
  const nextOut = [...out.filter((x) => !markBack.includes(x)), ...markOut]
  const outChanged = markOut.length > 0 || markBack.length > 0

  // ---- Equipment ----
  const eq = await getEquipment()
  const lower = (xs: string[]) => xs.map((x) => x.trim().toLowerCase()).filter(Boolean)
  const eqAdd = lower(u.addEquipment ?? []).filter((x) => !eq.have.some((h) => h.toLowerCase() === x))
  const eqRemove = lower(u.removeEquipment ?? []).filter((x) => eq.have.some((h) => h.toLowerCase() === x))
  if (eqAdd.length) applied.addEquipment = eqAdd
  if (eqRemove.length) applied.removeEquipment = eqRemove
  const nextEquipment: Equipment = {
    custom: addTo(eq.custom, eqAdd.filter((x) => !isCommonEquipment(x))),
    have: removeFrom(addTo(eq.have, eqAdd), eqRemove),
  }

  // ---- Settings: time limit, notes, targets ----
  const sc: SettingsChange = {}
  if (typeof u.timeLimitMin === 'number') {
    const prev = await getTimeLimit()
    const nextTL: TimeLimit =
      u.timeLimitMin > 0 ? { enabled: true, maxTotalMin: Math.min(240, Math.max(5, Math.round(u.timeLimitMin))) } : { ...prev, enabled: false }
    if (nextTL.enabled !== prev.enabled || nextTL.maxTotalMin !== prev.maxTotalMin) {
      sc.prevTimeLimit = prev
      sc.nextTimeLimit = nextTL
    }
  }
  if (typeof u.notes === 'string' && u.notes.trim() !== prefs.notes.trim()) {
    sc.prevNotes = prefs.notes
    sc.nextNotes = u.notes.trim()
    next.notes = sc.nextNotes
  }
  if (u.targets) {
    const prev = await getTargets()
    const nt: NutritionTargets = { ...prev }
    let touched = false
    for (const k of ['calories', 'protein', 'carbs', 'fat'] as const) {
      const v = u.targets[k]
      if (typeof v === 'number') {
        nt[k] = v > 0 ? Math.round(v) : undefined
        touched = true
      }
    }
    if (typeof u.targets.enabled === 'boolean') nt.enabled = u.targets.enabled
    else if (touched) nt.enabled = true
    if (JSON.stringify(nt) !== JSON.stringify(prev)) {
      sc.prevTargets = prev
      sc.nextTargets = nt
    }
  }
  if (Object.keys(sc).length) applied.settingsChange = sc

  if (!Object.keys(applied).length && !outChanged) return undefined
  await savePrefs(next)
  if (sa.length || sr.length) await saveStaples(nextStaples)
  if (outChanged) await saveStaplesOut(nextOut)
  if (!Object.keys(applied).length) return undefined
  if (eqAdd.length || eqRemove.length) await saveEquipment(nextEquipment)
  if (sc.nextTimeLimit) await saveTimeLimit(sc.nextTimeLimit)
  if (sc.nextTargets) await saveTargets(sc.nextTargets)
  return applied
}

/** Reverses a previously applied change set. */
export async function undoUpdates(a: ListUpdates): Promise<void> {
  const sc = a.settingsChange
  if (sc?.prevTimeLimit) await saveTimeLimit(sc.prevTimeLimit)
  if (sc?.prevTargets) await saveTargets(sc.prevTargets)
  if (sc?.prevNotes !== undefined) await savePrefs({ ...(await getPrefs()), notes: sc.prevNotes })
  await applyUpdates({
    addLikes: a.removeLikes,
    removeLikes: a.addLikes,
    addDislikes: a.removeDislikes,
    removeDislikes: a.addDislikes,
    addAllergies: a.removeAllergies,
    removeAllergies: a.addAllergies,
    addStaples: a.removeStaples,
    removeStaples: a.addStaples,
    markOut: a.markBack,
    markBack: a.markOut,
    addEquipment: a.removeEquipment,
    removeEquipment: a.addEquipment,
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
  if (a.markOut?.length) out.push(`Marked as ran out: ${a.markOut.join(', ')}`)
  if (a.markBack?.length) out.push(`Back in stock: ${a.markBack.join(', ')}`)
  push('Added to', 'Equipment', a.addEquipment)
  push('Removed from', 'Equipment', a.removeEquipment)
  const sc = a.settingsChange
  if (sc?.nextTimeLimit) {
    out.push(
      sc.nextTimeLimit.enabled
        ? `Max cook + prep time: ${sc.prevTimeLimit?.enabled ? `${formatMinutes(sc.prevTimeLimit.maxTotalMin)} → ` : ''}${formatMinutes(sc.nextTimeLimit.maxTotalMin)}`
        : 'Turned off the cook time limit',
    )
  }
  if (sc?.nextTargets) {
    const t = sc.nextTargets
    const parts = [
      t.calories && `${t.calories.toLocaleString()} cal`,
      t.protein && `${t.protein}g protein`,
      t.carbs && `${t.carbs}g carbs`,
      t.fat && `${t.fat}g fat`,
    ].filter(Boolean)
    out.push(t.enabled ? `Daily targets: ${parts.join(' · ') || 'on'}` : 'Turned off calorie & macro targets')
  }
  if (sc?.nextNotes !== undefined) {
    const n = sc.nextNotes
    out.push(n ? `Notes: “${n.length > 80 ? `${n.slice(0, 80)}…` : n}”` : 'Cleared your notes')
  }
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
