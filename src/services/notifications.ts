// ============================================================================
// BLASTI - Service des Notifications & Alertes
// ============================================================================

import { supabase, isLiveSupabaseConfigured } from '../lib/supabase'
import type { AppNotification } from '../types/database'
import { mockDb, DEMO_PASSENGER } from '../lib/mockData'

export async function getNotifications(): Promise<AppNotification[]> {
  if (!isLiveSupabaseConfigured) {
    return mockDb.notifications.filter((n) => n.user_id === DEMO_PASSENGER.id)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function markAsRead(notificationId: string) {
  if (!isLiveSupabaseConfigured) {
    const note = mockDb.notifications.find((n) => n.id === notificationId)
    if (note) note.read_at = new Date().toISOString()
    mockDb.notify()
    return
  }

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
}

export async function markAllAsRead() {
  if (!isLiveSupabaseConfigured) {
    mockDb.notifications.forEach((n) => {
      n.read_at = new Date().toISOString()
    })
    mockDb.notify()
    return
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
}
