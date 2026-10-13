import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('メールアドレスの形式が正しくありません')),
  note: z.string().trim().max(100, 'メモは100文字以内で入力してください'),
})

const membersKey = ['admin', 'members'] as const

// 管理者RPC。権限の判定はDB関数の中で行う（画面の出し分けは利便性のため）。
export function useMembers() {
  return useQuery({
    queryKey: membersKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_members')
      if (error) throw error
      return data
    },
  })
}

export function useInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; note: string }) => {
      const { error } = await supabase.rpc('admin_invite', { p_email: input.email, p_note: input.note || null })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey }),
  })
}

export function useRevoke() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.rpc('admin_revoke', { p_email: email })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey }),
  })
}

// 完全削除（取り消し済みの人だけ）。対象と再入力の一致・管理者かどうかは DB 関数の中でも確認する
export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; confirmEmail: string }) => {
      const { data, error } = await supabase.rpc('admin_delete_account', {
        p_email: input.email,
        p_confirm_email: input.confirmEmail,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey }),
  })
}

// 再入力したメールが対象と一致するか（前後の空白・大文字小文字は区別しない。DB 側と同じ扱い）
export function confirmationMatches(target: string, typed: string): boolean {
  return typed.trim().toLowerCase() === target.trim().toLowerCase() && typed.trim() !== ''
}
