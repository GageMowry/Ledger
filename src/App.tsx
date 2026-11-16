import { useEffect, useRef, type ComponentType, type SVGProps } from 'react'
import { navigate, useRoute, type Route } from './router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, requestPersistentStorage } from './db'
import { todayISO } from './dates'
import UpdateBanner from './components/UpdateBanner'
import { BodyIcon, ClosetIcon, MealsIcon, SettingsIcon, TasksIcon, TodayIcon } from './components/Icons'
import Today from './pages/Today'
import Settings from './pages/Settings'
import Tasks from './pages/Tasks'
import Body from './pages/Body'
import Meals from './pages/Meals'
import Closet from './pages/Closet'

const TABS: { route: Route; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { route: 'today', label: 'Today', Icon: TodayIcon },
  { route: 'tasks', label: 'Tasks', Icon: TasksIcon },
  { route: 'body', label: 'Body', Icon: BodyIcon },
  { route: 'meals', label: 'Meals', Icon: MealsIcon },
  { route: 'closet', label: 'Closet', Icon: ClosetIcon },
]

const TITLES: Record<Route, string> = {
  today: 'Today',
  tasks: 'Tasks',
  body: 'Body',
  meals: 'Meals',
  closet: 'Closet',
  settings: 'Settings',
}

function Page({ route }: { route: Route }) {
  switch (route) {
    case 'today':
      return <Today />
    case 'settings':
      return <Settings />
    case 'tasks':
      return <Tasks />
    case 'body':
      return <Body />
    case 'meals':
      return <Meals />
    case 'closet':
      return <Closet />
  }
}

export default function App() {
  const route = useRoute()
  const navRef = useRef<HTMLElement>(null)
  // Open tasks due today or overdue, shown as a badge on the Tasks tab.
  const dueCount = useLiveQuery(async () => {
    const today = todayISO()
    return db.tasks.filter((t) => !t.done && !!t.dueDate && t.dueDate <= today).count()
  }, [])

  // Publish the tab bar's height so fixed bars (chat composer) can sit just above it.
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const set = () => document.documentElement.style.setProperty('--nav-h', `${el.offsetHeight}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  return (
    // Always at least 1px taller than the screen: on iPhone home-screen apps, a page
    // that can't scroll places the fixed tab bar differently from one that can.
    <div className="mx-auto flex max-w-xl flex-col" style={{ minHeight: 'calc(100dvh + 1px)' }}>
      <header className="pt-safe sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-xl font-semibold tracking-tight">{TITLES[route]}</h1>
          <button
            type="button"
            onClick={() => navigate('settings')}
            className={`rounded-full p-2 ${route === 'settings' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}
            aria-label="Settings"
          >
            <SettingsIcon className="h-6 w-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-28">
        <Page route={route} />
      </main>

      <nav ref={navRef} style={{ bottom: 'calc(-1 * var(--vp-gap, 0px))' }} className="pb-safe fixed inset-x-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map(({ route: r, label, Icon }) => {
            const active = r === route
            return (
              <button
                key={r}
                type="button"
                onClick={() => navigate(r)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                }`}
                aria-current={active ? 'page' : undefined}
                aria-label={r === 'tasks' && dueCount ? `${label}, ${dueCount} due` : label}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {r === 'tasks' && !!dueCount && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] leading-none font-bold text-white">
                      {dueCount > 9 ? '9+' : dueCount}
                    </span>
                  )}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      </nav>
      <UpdateBanner />
    </div>
  )
}
