import { db, getSetting, type ClothingCategory, type ClothingItem } from './db'
import { HEIGHT_IN, MEASUREMENTS, fmtNum, formatHeight, latestByMetric, suggestedSizes } from './body'

export const CATEGORIES: { key: ClothingCategory; label: string; icon: string }[] = [
  { key: 'top', label: 'Tops', icon: '👕' },
  { key: 'bottom', label: 'Bottoms', icon: '👖' },
  { key: 'outerwear', label: 'Outerwear', icon: '🧥' },
  { key: 'shoes', label: 'Shoes', icon: '👟' },
  { key: 'accessory', label: 'Accessories', icon: '⌚' },
  { key: 'activewear', label: 'Activewear', icon: '🏃' },
]
export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<ClothingCategory, (typeof CATEGORIES)[number]>

export const OCCASIONS = ['Work', 'Gym', 'Casual', 'Going out'] as const

export type ItemInput = Omit<ClothingItem, 'id' | 'createdAt' | 'updatedAt'>

export async function saveItem(input: ItemInput, id?: number): Promise<number> {
  const clean = {
    ...input,
    name: input.name.trim(),
    color: input.color?.trim() || undefined,
    pattern: input.pattern?.trim() || undefined,
    fit: input.fit?.trim() || undefined,
    description: input.description?.trim() || undefined,
  }
  const now = Date.now()
  if (id) {
    await db.clothes.update(id, { ...clean, updatedAt: now })
    return id
  }
  return (await db.clothes.add({ ...clean, createdAt: now, updatedAt: now } as ClothingItem)) as number
}

/** Deleting an item also removes it from any saved outfits. */
export async function deleteItem(id: number): Promise<void> {
  await db.transaction('rw', db.clothes, db.outfits, async () => {
    await db.clothes.delete(id)
    await db.outfits.toCollection().modify((o) => {
      o.itemIds = o.itemIds.filter((x) => x !== id)
    })
  })
}

// ---------------------------------------------------------------- images

const THUMB = 384 // px, square: sharp enough for a 2-up tile on a 3x screen, ~20–30 KB

async function toBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), 'image/jpeg', quality),
  )
}

/** Square, center-cropped (or region-cropped) JPEG thumbnail for tiles. */
export async function makeThumb(
  source: Blob | ImageBitmap,
  region?: { x: number; y: number; w: number; h: number },
): Promise<Blob> {
  const bmp = source instanceof Blob ? await toBitmap(source) : source
  let { x, y, w, h } = region ?? { x: 0, y: 0, w: bmp.width, h: bmp.height }
  // Make the crop square around its center, inside the image.
  const side = Math.min(Math.max(w, h), bmp.width, bmp.height)
  const cx = x + w / 2
  const cy = y + h / 2
  x = Math.min(Math.max(0, cx - side / 2), bmp.width - side)
  y = Math.min(Math.max(0, cy - side / 2), bmp.height - side)
  w = h = side
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = THUMB
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, THUMB, THUMB)
  ctx.drawImage(bmp, x, y, w, h, 0, 0, THUMB, THUMB)
  return canvasToBlob(canvas, 0.72)
}

/** Downscaled copy for sending to Gemini (not stored). */
export async function prepareForAI(file: Blob, maxSide = 1024): Promise<{ bitmap: ImageBitmap; base64: string; width: number; height: number }> {
  const bitmap = await toBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  const blob = await canvasToBlob(canvas, 0.82)
  return { bitmap, base64: await blobToBase64(blob), width, height }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Gemini boxes are [ymin, xmin, ymax, xmax] on a 0–1000 scale; pad a little for the tile. */
export function boxToRegion(box: number[], width: number, height: number) {
  const [ymin, xmin, ymax, xmax] = box.map((v) => Math.min(1000, Math.max(0, v)))
  const pad = 0.08
  const w = ((xmax - xmin) / 1000) * width
  const h = ((ymax - ymin) / 1000) * height
  return {
    x: (xmin / 1000) * width - w * pad,
    y: (ymin / 1000) * height - h * pad,
    w: w * (1 + pad * 2),
    h: h * (1 + pad * 2),
  }
}

// ---------------------------------------------------------------- body context for the AI

export async function bodyContext(): Promise<string> {
  const rows = await db.measurements.toArray()
  const latest = latestByMetric(rows)
  const parts = [`Height ${formatHeight(HEIGHT_IN)}`]
  if (latest.weight) parts.push(`weight ${fmtNum(latest.weight.value)} lbs`)
  const tape = MEASUREMENTS.filter((m) => latest[m.key]).map((m) => `${m.label.toLowerCase()} ${fmtNum(latest[m.key].value, 2)}"`)
  if (tape.length) parts.push(tape.join(', '))
  const sizes = suggestedSizes(latest)
  if (sizes.length) parts.push(`estimated sizes: ${sizes.map((s) => `${s.label} ${s.value}`).join(', ')}`)
  return parts.join('; ')
}

export function describeItemLine(i: ClothingItem): string {
  const attrs = [i.color, i.pattern, i.fit && `${i.fit} fit`].filter(Boolean).join(', ')
  return `#${i.id} | ${i.category} | ${i.name}${attrs ? ` | ${attrs}` : ''}${i.description ? ` | ${i.description.slice(0, 140)}` : ''}`
}

const VIEW_KEY = 'ledger.closet.view'
export function readView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}
export function writeView(v: 'grid' | 'list') {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* storage unavailable */
  }
}

export const hasGeminiKey = async () => !!(await getSetting<string>('geminiApiKey', ''))
