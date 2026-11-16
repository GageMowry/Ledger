import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { getPrefs, getTargets, getTimeLimit, statsByMeal } from './meals'

/** Everything the Meals screens need, live from the on-device database. */
export function useMealsData() {
  const data = useLiveQuery(async () => {
    const [meals, logs, prefs, targets, timeLimit] = await Promise.all([
      db.meals.toArray(),
      db.mealLogs.toArray(),
      getPrefs(),
      getTargets(),
      getTimeLimit(),
    ])
    return { meals, logs, prefs, targets, timeLimit }
  })

  const derived = useMemo(() => {
    if (!data) return null
    const byId = new Map(data.meals.map((m) => [m.id, m]))
    const stats = statsByMeal(data.logs)
    const tags = [...new Set(data.meals.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b))
    return { byId, stats, tags }
  }, [data])

  if (!data || !derived) return null
  return { ...data, ...derived }
}

export type MealsData = NonNullable<ReturnType<typeof useMealsData>>
