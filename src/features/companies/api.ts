import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Company, Database } from '@/lib/database.types'
import { isPermissionError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import {
  applicationUpdate,
  companyFormSchema,
  companyNameSchema,
  preferenceSchema,
  type CompanyFormInput,
} from './schema'

export { companyNameSchema } from './schema'

export const companiesKey = ['companies'] as const
export const companyKey = (id: string) => ['companies', id] as const

// 一覧に必要な列だけ。RLS により自分の企業だけが返る。ゴミ箱内は除く
const LIST_COLUMNS =
  'id, name, preference, application_status, applied_on, application_type, job_type, memo, selection_status, selection_status_reason, final_outcome, created_at, updated_at'

export type CompanyListItem = Pick<
  Company,
  | 'id'
  | 'name'
  | 'preference'
  | 'application_status'
  | 'applied_on'
  | 'application_type'
  | 'job_type'
  | 'memo'
  | 'selection_status'
  | 'selection_status_reason'
  | 'final_outcome'
  | 'created_at'
  | 'updated_at'
>

export function useCompanies() {
  return useQuery({
    queryKey: companiesKey,
    queryFn: async (): Promise<CompanyListItem[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select(LIST_COLUMNS)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

// 1社分。他人の企業や存在しない id は RLS により null になる（「見つかりません」と表示）
export function useCompany(id: string) {
  return useQuery({
    queryKey: companyKey(id),
    queryFn: async (): Promise<Company | null> => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

// 招待が取り消された等で拒否されたら、プロフィールを読み直して招待外の画面へ移す
function onMutationError(queryClient: QueryClient) {
  return (error: unknown) => {
    if (isPermissionError(error)) void queryClient.invalidateQueries({ queryKey: ['profile'] })
  }
}

export function useAddCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      // user_id はDB側の既定値（auth.uid()）に任せ、画面からは送らない。新しい企業は未応募で作られる
      const { data, error } = await supabase
        .from('companies')
        .insert({ name: companyNameSchema.parse(name) })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companiesKey }),
    onError: onMutationError(queryClient),
  })
}

type CompanyUpdate = Database['public']['Tables']['companies']['Update']

// 企業の行を更新する共通処理。更新後は一覧と詳細を読み直す（選考状態・履歴は DB が書く）
function useUpdateCompany<T>(id: string, toUpdate: (input: T) => CompanyUpdate) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: T) => {
      const { data, error } = await supabase.from('companies').update(toUpdate(input)).eq('id', id).select('id')
      if (error) throw error
      // RLS で対象外（他人の企業・削除済み）のときは0行になる
      if (data.length === 0) throw { code: 'P0002', message: '企業が見つかりません' }
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: companiesKey }),
        queryClient.invalidateQueries({ queryKey: ['timeline'] }),
      ]),
    onError: onMutationError(queryClient),
  })
}

export function useSaveCompanyInfo(id: string) {
  return useUpdateCompany(id, (input: CompanyFormInput) => companyFormSchema.parse(input))
}

// 応募日を渡すと応募済み、null で未応募に戻す（ステップは変えない。設計書 02 §3.5.1）
export function useSetApplication(id: string) {
  return useUpdateCompany(id, (appliedOn: string | null) => applicationUpdate(appliedOn))
}

export function useSetPreference(id: string) {
  return useUpdateCompany(id, (preference: number | null) => ({ preference: preferenceSchema.parse(preference) }))
}
