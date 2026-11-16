import { useState } from 'react'
import type { Task } from '../db'
import { addDays, todayISO } from '../dates'
import type { TaskInput } from '../tasks'

const PRIORITIES: Task['priority'][] = ['low', 'normal', 'high']

export default function TaskForm({
  initial,
  categories,
  onSubmit,
  onDelete,
  submitLabel,
}: {
  initial?: Partial<TaskInput>
  categories: string[]
  onSubmit: (input: TaskInput) => void | Promise<void>
  onDelete?: () => void
  submitLabel: string
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [priority, setPriority] = useState<Task['priority']>(initial?.priority ?? 'normal')
  const [category, setCategory] = useState(initial?.category ?? '')

  const today = todayISO()
  const quickDates = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'Next week', value: addDays(today, 7) },
  ]

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        void onSubmit({ title, notes, dueDate, priority, category })
      }}
    >
      <input
        className="field"
        placeholder="What needs doing?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={!initial?.title}
        required
      />

      <textarea
        className="field min-h-20"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div>
        <label className="text-sm font-medium" htmlFor="due">
          Due date
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          {quickDates.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setDueDate(q.value)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                dueDate === q.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {q.label}
            </button>
          ))}
          {dueDate && (
            <button
              type="button"
              onClick={() => setDueDate('')}
              className="rounded-full px-3 py-1.5 text-sm text-slate-500"
            >
              No date
            </button>
          )}
        </div>
        <input id="due" type="date" className="field mt-2" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>

      <div>
        <span className="text-sm font-medium">Priority</span>
        <div className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`rounded-lg py-2 text-sm font-medium capitalize ${
                priority === p ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="category">
          Category
        </label>
        <input
          id="category"
          className="field mt-1"
          placeholder="e.g. Home, Errands, Work"
          list="task-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <datalist id="task-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" className="btn-primary flex-1" disabled={!title.trim()}>
          {submitLabel}
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            onClick={onDelete}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  )
}
