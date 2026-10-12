import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import type { Company } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export const companyNameSchema = z
  .string()
  .trim()
  .min(1, '企業名を入力してください')
  .max(100, '企業名は100文字以内で入力してください')

const companiesKey = ['companies'] as const

// RLS により自分の企業だけが返る。ゴミ箱内は除く。
export function useCompanies() {
  return useQuery({
    queryKey: companiesKey,
    queryFn: async (): Promise<Pick<Company, 'id' | 'name' | 'created_at'>[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useAddCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      // user_id はDB側の既定値（auth.uid()）に任せ、画面からは送らない
      const { error } = await supabase.from('companies').insert({ name: companyNameSchema.parse(name) })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companiesKey }),
  })
}
