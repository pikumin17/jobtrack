import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Company } from '@/lib/database.types'
import { isPermissionError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export type TrashedCompany = Pick<Company, 'id' | 'name' | 'deleted_at'>

export function useTrashedCompanies() {
  return useQuery({
    queryKey: ['companies', 'trash'],
    queryFn: async (): Promise<TrashedCompany[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// ゴミ箱の操作は RPC（invoker。RLS がそのまま効く）。企業・ステップ・履歴の表示をまとめて読み直す
function useTrashMutation(rpc: 'trash_company' | 'restore_company' | 'purge_company') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase.rpc(rpc, { p_company_id: companyId })
      if (error) throw error
    },
    onSettled: () =>
      Promise.all(
        [['companies'], ['steps'], ['timeline']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
    onError: (error) => {
      if (isPermissionError(error)) void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export const useTrashCompany = () => useTrashMutation('trash_company')
export const useRestoreCompany = () => useTrashMutation('restore_company')
export const usePurgeCompany = () => useTrashMutation('purge_company')
