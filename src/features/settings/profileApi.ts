import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuth } from '@/features/auth/auth-context'
import { profileQueryKey } from '@/features/auth/profile'
import { supabase } from '@/lib/supabase'

// 初回設定とプロフィール設定で共通の入力（すべて任意、02 §3.3 profiles）
export const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(50, '表示名は50文字以内で入力してください')
    .transform((v) => (v === '' ? null : v)),
  graduation_year: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d{4}$/.test(v) && Number(v) >= 2000 && Number(v) <= 2100),
      '西暦4桁で入力してください',
    )
    .transform((v) => (v === '' ? null : Number(v))),
  purpose: z
    .string()
    .trim()
    .max(200, '利用目的は200文字以内で入力してください')
    .transform((v) => (v === '' ? null : v)),
})
export type ProfileInput = z.input<typeof profileSchema>
export type ProfileValues = z.output<typeof profileSchema>

export function useSaveProfile() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const userId = session?.user.id
  return useMutation({
    mutationFn: async (values: Partial<ProfileValues> & { onboarding_completed_at?: string }) => {
      const { data, error } = await supabase.from('profiles').update(values).eq('id', userId!).select('id')
      if (error) throw error
      if (data.length === 0) throw { code: '42501', message: 'ログインし直してください' }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) }),
  })
}
