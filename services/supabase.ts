'use client'

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase
  if (typeof window === 'undefined') return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _supabase = createClient(url, key)
  return _supabase
}

export function isSupabaseConfigured(): boolean {
  if (typeof window === 'undefined') return false
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
