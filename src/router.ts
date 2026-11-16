import { useSyncExternalStore } from 'react'

/** Hash-based routing (#/tasks) so GitHub Pages never needs server rewrites. */

export type Route = 'today' | 'tasks' | 'body' | 'meals' | 'closet' | 'settings'

const ROUTES: Route[] = ['today', 'tasks', 'body', 'meals', 'closet', 'settings']

function read(): Route {
  const name = window.location.hash.replace(/^#\/?/, '').split('/')[0]
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'today'
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, read)
}

export function navigate(route: Route) {
  window.location.hash = `/${route}`
}
