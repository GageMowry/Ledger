import { useEffect, useRef, useState } from 'react'
import type { ClothingCategory, ClothingItem } from '../db'
import { warmUp } from '../gemini'
import { CATEGORIES, makeThumb, type ItemInput } from '../closet'
import { describeItem } from '../closetAI'
import ClothingThumb from './ClothingThumb'

/**
 * Add/edit a clothing item. "Generate" asks Gemini to write the description
 * (and fill blank attributes) from the photo and details; nothing is saved
 * until the user taps Save. Delete sits at the very bottom behind a confirm.
 */
export default function ItemForm({
  initial,
  submitLabel,
  onSubmit,
  onDelete,
  autoGenerate = false,
}: {
  initial?: Partial<ClothingItem>
  submitLabel: string
  onSubmit: (v: ItemInput) => void | Promise<void>
  onDelete?: () => void
  autoGenerate?: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<ClothingCategory>(initial?.category ?? 'top')
  const [color, setColor] = useState(initial?.color ?? '')
  const [pattern, setPattern] = useState(initial?.pattern ?? '')
  const [fit, setFit] = useState(initial?.fit ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [photo, setPhoto] = useState<Blob | undefined>(initial?.photo)
  const [busy, setBusy] = useState<'photo' | 'ai' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const ranAuto = useRef(false)

  // Connect to Gemini while the form is open, so Generate starts sooner.
  useEffect(() => warmUp(), [])

  async function generate(withPhoto = photo) {
    setBusy('ai')
    setError(null)
    try {
      const r = await describeItem({ name, category, color, pattern, fit, description, photo: withPhoto })
      setDescription(r.description)
      // Fill blanks; keep anything the user already typed.
      if (!name.trim()) setName(r.name)
      // On a new item the AI also picks the category from the photo.
      if (autoGenerate && !name.trim()) setCategory(r.category)
      if (!color.trim()) setColor(r.color)
      if (!pattern.trim()) setPattern(r.pattern)
      if (!fit.trim()) setFit(r.fit)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function pickPhoto(file: File) {
    setBusy('photo')
    setError(null)
    try {
      const thumb = await makeThumb(file)
      setPhoto(thumb)
      setBusy(null)
      if (autoGenerate && !ranAuto.current && !name.trim()) {
        ranAuto.current = true
        await generate(thumb)
      }
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        void onSubmit({ name, category, color, pattern, fit, description, photo })
      }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-28 shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-700"
          aria-label={photo ? 'Change photo' : 'Add photo'}
        >
          <ClothingThumb item={{ photo, category, name }} />
          <span className="block bg-slate-50 py-1 text-xs font-medium text-indigo-600 dark:bg-slate-800 dark:text-indigo-400">
            {busy === 'photo' ? 'Processing…' : photo ? 'Change photo' : '+ Add photo'}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pickPhoto(f)
            e.target.value = ''
          }}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <input className="field" placeholder="Name, e.g. Navy oxford shirt" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <select className="field" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as ClothingCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['Color', color, setColor, 'navy'],
            ['Pattern', pattern, setPattern, 'solid'],
            ['Fit', fit, setFit, 'slim'],
          ] as const
        ).map(([label, v, set, ph]) => (
          <label key={label} className="text-xs">
            <span className="font-medium">{label}</span>
            <input className="field mt-1 px-2.5" placeholder={ph} aria-label={label} value={v} onChange={(e) => set(e.target.value)} />
          </label>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Description</span>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy !== null}
            className="text-sm font-medium text-indigo-600 disabled:opacity-50 dark:text-indigo-400"
          >
            {busy === 'ai' ? 'Generating…' : description ? '✦ Regenerate' : '✦ Generate'}
          </button>
        </div>
        <textarea
          className="field mt-1 min-h-24"
          aria-label="Description"
          placeholder="Material, formality, what it pairs with…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      <button type="submit" className="btn-primary w-full" disabled={!name.trim() || busy !== null}>
        {submitLabel}
      </button>

      {onDelete && (
        <div className="border-t border-slate-200 pt-4 text-center dark:border-slate-800">
          <button type="button" onClick={onDelete} className="text-sm text-rose-600 dark:text-rose-400">
            Delete this item…
          </button>
        </div>
      )}
    </form>
  )
}
