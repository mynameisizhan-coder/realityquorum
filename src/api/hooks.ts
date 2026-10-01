import { useCallback, useEffect, useState } from 'react'
import type { CaseView, MissionView, PublicUpdateView, SessionUser } from '../../shared/api'
import { api } from './client'
import { ensureSession, switchUser } from './caseStore'

// Small data hooks for screens that need live server state (operator dashboard, missions, public updates).

export interface Resource<T> {
  data: T
  loading: boolean
  error: string
  reload: () => Promise<void>
}

function useResource<T>(load: () => Promise<T>, initial: T, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await load())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data.')
    } finally {
      setLoading(false)
    }
  }, deps)
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, loading, error, reload }
}

/** Current demo account, the list for a role switcher, and a way to switch. */
export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [users, setUsers] = useState<SessionUser[]>([])
  useEffect(() => {
    let active = true
    Promise.all([ensureSession(), api.users()])
      .then(([me, all]) => {
        if (active) {
          setUser(me)
          setUsers(all)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const switchTo = useCallback(async (userId: string) => {
    setUser(await switchUser(userId))
  }, [])
  return { user, users, switchTo }
}

/** Every case the signed-in account may see, as full server views. Re-runs when the account changes. */
export function useCaseViews(userId?: string) {
  return useResource<CaseView[]>(
    async () => {
      await ensureSession()
      return api.cases()
    },
    [],
    [userId],
  )
}

/** Pass a refresh key that changes (e.g. after an action) to refetch. */
export function useMissions(userId?: string, refreshKey?: string) {
  return useResource<MissionView[]>(
    async () => {
      await ensureSession()
      return api.missions()
    },
    [],
    [userId, refreshKey],
  )
}

/** Pass a key that changes (e.g. after publishing) to refetch. */
export function usePublicUpdates(refreshKey?: string) {
  return useResource<PublicUpdateView[]>(() => api.publicUpdates(), [], [refreshKey])
}
