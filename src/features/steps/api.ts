import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { companiesKey } from '@/features/companies/api'
import type { ClosedReason, Database, FinalOutcome, SelectionStep } from '@/lib/database.types'
import { isPermissionError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { stepLabelSchema } from './schema'
import type { StepTemplate } from './templates'

export const stepsKey = (companyId: string) => ['steps', companyId] as const

// 企業のステップを並び順に。RLS により自分のものだけが返る
export function useSteps(companyId: string) {
  return useQuery({
    queryKey: stepsKey(companyId),
    queryFn: async (): Promise<SelectionStep[]> => {
      const { data, error } = await supabase
        .from('selection_steps')
        .select('*')
        .eq('company_id', companyId)
        .order('position', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

// 全企業のステップ（一覧の結果待ち・次回予定の算出用）。必要な列だけ
export const STEP_SUMMARY_COLUMNS =
  'id, company_id, position, label, status, deadline_date, deadline_at, scheduled_at, scheduled_end_at, completed_at, result_expected_on'

export type StepSummaryRow = Pick<
  SelectionStep,
  | 'id'
  | 'company_id'
  | 'position'
  | 'label'
  | 'status'
  | 'deadline_date'
  | 'deadline_at'
  | 'scheduled_at'
  | 'scheduled_end_at'
  | 'completed_at'
  | 'result_expected_on'
>

export function useAllSteps() {
  return useQuery({
    queryKey: ['steps', 'all'],
    queryFn: async (): Promise<StepSummaryRow[]> => {
      const { data, error } = await supabase.from('selection_steps').select(STEP_SUMMARY_COLUMNS)
      if (error) throw error
      return data
    },
  })
}

// ステップの変更で、企業の選考状態・更新日時と履歴も DB が書き換える。関係する表示をまとめて読み直す
function useStepMutation<T>(run: (input: T) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () =>
      Promise.all([
        // 企業ごとの一覧と、全企業分（企業一覧・ホーム用）の両方
        queryClient.invalidateQueries({ queryKey: ['steps'] }),
        queryClient.invalidateQueries({ queryKey: companiesKey }),
        queryClient.invalidateQueries({ queryKey: ['timeline'] }),
      ]),
    onError: (error) => {
      if (isPermissionError(error)) void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

const notFound = { code: 'P0002', message: 'ステップが見つかりません' }

// 1件でも複数でも1回の追加で送る（並び順は DB が末尾から順に付ける）
export function useAddSteps(companyId: string) {
  return useStepMutation(async (templates: StepTemplate[]) => {
    const rows = templates.map((t) => ({ company_id: companyId, kind: t.kind, label: stepLabelSchema.parse(t.label) }))
    const { error } = await supabase.from('selection_steps').insert(rows)
    if (error) throw error
  })
}

type StepUpdate = Database['public']['Tables']['selection_steps']['Update']

export function useUpdateStep() {
  return useStepMutation(async ({ id, values }: { id: string; values: StepUpdate }) => {
    const { data, error } = await supabase.from('selection_steps').update(values).eq('id', id).select('id')
    if (error) throw error
    if (data.length === 0) throw notFound
  })
}

export function useDeleteStep() {
  return useStepMutation(async (id: string) => {
    const { data, error } = await supabase.from('selection_steps').delete().eq('id', id).select('id')
    if (error) throw error
    if (data.length === 0) throw notFound
  })
}

// 企業の全ステップを、指定した順に並べ直す（1回の RPC。他人の・別企業のステップは DB が拒否、2-05）
export function useReorderSteps(companyId: string) {
  return useStepMutation(async (stepIds: string[]) => {
    const { error } = await supabase.rpc('reorder_steps', { p_company_id: companyId, p_step_ids: stepIds })
    if (error) throw error
  })
}

// 「結果を記録」。null で記録を取り消す（理由も消す）。記録日時は DB が付ける
export function useRecordOutcome(companyId: string) {
  return useStepMutation(async ({ outcome, reason }: { outcome: FinalOutcome | null; reason: ClosedReason | null }) => {
    const { data, error } = await supabase
      .from('companies')
      .update({ final_outcome: outcome, closed_reason: outcome === null ? null : reason })
      .eq('id', companyId)
      .select('id')
    if (error) throw error
    if (data.length === 0) throw { code: 'P0002', message: '企業が見つかりません' }
  })
}

// 1つ上・下へ動かしたときの id の並び
export function moveStep(ids: string[], index: number, delta: -1 | 1): string[] | null {
  const target = index + delta
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return null
  const next = [...ids]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return next
}
