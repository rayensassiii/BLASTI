// ============================================================================
// BLASTI - Hook Supabase Realtime pour les Notifications Utilisateur
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { supabase, isLiveSupabaseConfigured } from '../lib/supabase'
import type { AppNotification } from '../types/database'
import { getNotifications, markAsRead, markAllAsRead } from '../services/notifications'
import { mockDb } from '../lib/mockData'

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await getNotifications()
      setNotifications(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    if (!isLiveSupabaseConfigured) {
      const unsubscribe = mockDb.subscribe(() => {
        refresh()
      })
      return () => {
        unsubscribe()
      }
    }

    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            refresh()
          }
        )
        .subscribe()
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [refresh])

  const unreadCount = notifications.filter((n) => !n.read_at).length

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead: async (id: string) => {
      await markAsRead(id)
      refresh()
    },
    markAllAsRead: async () => {
      await markAllAsRead()
      refresh()
    },
  }
}
