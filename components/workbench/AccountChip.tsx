'use client'

import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { LogIn, LogOut, Trophy } from 'lucide-react'
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../../convex/_generated/api'
import { getOrCreateGuestKey } from '../../services/guestIdentity'
import { isConvexConfigured } from '../../services/syncEngine'
import styles from '../environment/ArenaScene.module.css'
import { LadderDrawer } from './LadderDrawer'

/**
 * A backend that predates the auth functions (or an unreachable one) makes the
 * account queries throw during render; the chip disappears instead of taking the
 * arena down with it.
 */
class AccountBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

/** Hidden unless Convex is configured; signed-out play works exactly as before. */
export function AccountChip() {
  if (!isConvexConfigured()) return null
  return <AccountBoundary><AccountControls /></AccountBoundary>
}

function AccountControls() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn, signOut } = useAuthActions()
  const me = useQuery(api.account.me, isAuthenticated ? {} : 'skip')
  const claimGuest = useMutation(api.account.claimGuest)
  const claimedFor = useRef<string | null>(null)
  const [ladderOpen, setLadderOpen] = useState(false)

  // Fold this browser's guest history into the account, once per sign-in.
  useEffect(() => {
    if (!me || claimedFor.current === me.userId) return
    claimedFor.current = me.userId
    const guestKey = getOrCreateGuestKey()
    const claim = async () => {
      for (let round = 0; round < 20; round++) {
        const result = await claimGuest({ guestKey })
        if (result.remaining === 0) return
      }
    }
    claim().catch(() => { claimedFor.current = null })
  }, [me, claimGuest])

  if (isLoading) return null
  if (!isAuthenticated) {
    return (
      <button type="button" className={styles.helpButton} onClick={() => void signIn('github')}>
        <LogIn size={15} /> Sign in
      </button>
    )
  }
  return (
    <>
      <button type="button" className={styles.helpButton} onClick={() => setLadderOpen(true)}>
        <Trophy size={15} /> Ladder
      </button>
      <button type="button" className={styles.helpButton} onClick={() => void signOut()} title="Sign out">
        <LogOut size={15} /> {me?.name ?? 'Signed in'}
      </button>
      <LadderDrawer open={ladderOpen} onClose={() => setLadderOpen(false)} />
    </>
  )
}
