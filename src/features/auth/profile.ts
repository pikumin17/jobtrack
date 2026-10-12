import { useQuery } from '@tanstack/react-query'
import type { Profile } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const

// 自分のプロフィール。RLS により、停止中・未招待の利用者には行が返らない（null）。
export function useProfile() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: profileQueryKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}
