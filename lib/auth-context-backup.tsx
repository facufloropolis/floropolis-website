'use client'
// Auth context for the BACKUP project (Phase 4 transactional auth).
// v1 | 2026-05-17 | Job_PM W5-S15 [V8 SHADOW]
//
// Provides user + client_profile state to client components that live in the
// transactional flow (signup, login, checkout). Wraps the backup-client so
// the session it reads is the backup-project session (not prod's).
//
// Import: import { useAuthBackup, AuthBackupProvider } from '@/lib/auth-context-backup'
//
// DO NOT modify lib/auth-context.tsx -- prod hook still serves Rose's legacy
// /shop and /quote flows.

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createBackupClient } from '@/lib/supabase/backup-client'
import type { User } from '@supabase/supabase-js'

export type ClientProfileBackup = {
  id: string
  user_id: string
  business_name: string | null
  phone: string | null
  status: 'pending' | 'approved' | 'rejected' | 'admin'
  koronet_id: string | null
  notes: string | null
  created_at: string
  approved_at: string | null
}

type AuthBackupContextType = {
  user: User | null
  profile: ClientProfileBackup | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthBackupContext = createContext<AuthBackupContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function AuthBackupProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<ClientProfileBackup | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const supabase = createBackupClient()
      const { data } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      setProfile((data as ClientProfileBackup | null) ?? null)
    } catch (err) {
      console.warn('[auth-context-backup] loadProfile failed:', err)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let supabase
    try {
      supabase = createBackupClient()
    } catch (err) {
      // Backup env not configured (e.g. local dev without NEXT_PUBLIC_BACKUP_*).
      // Behave like an unauthenticated session rather than crashing the page.
      console.warn('[auth-context-backup] backup client unavailable:', err)
      setLoading(false)
      return
    }

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Listen for auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const signOut = async () => {
    try {
      const supabase = createBackupClient()
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('[auth-context-backup] signOut failed:', err)
    }
  }

  return (
    <AuthBackupContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthBackupContext.Provider>
  )
}

export const useAuthBackup = () => useContext(AuthBackupContext)
