import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CalendarEntry } from '@/lib/calendar'
import type { Database, JobEvent, Task } from '@/lib/database.types'
import { isPermissionError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// カレンダーは元の表を束ねたビュー（calendar_items）から読む。RLS により自分の項目だけ、ゴミ箱の企業の項目は除かれる
export const calendarKey = ['calendar'] as const
const CALENDAR_COLUMNS =
  'source_table, source_id, company_id, company_name, item_type, title, starts_at, ends_at, all_day_date, done, priority'

export function useCalendarItems() {
  return useQuery({
    queryKey: calendarKey,
    queryFn: async (): Promise<CalendarEntry[]> => {
      const { data, error } = await supabase.from('calendar_items').select(CALENDAR_COLUMNS)
      if (error) throw error
      return data
    },
  })
}

export const tasksKey = ['tasks'] as const
export const eventsKey = ['events'] as const

// タスクは期日のないものも含めて全部（タスクの一覧・ホームの優先タスク用）
export function useTasks() {
  return useQuery({
    queryKey: tasksKey,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useEvent(id: string | null) {
  return useQuery({
    enabled: id !== null,
    queryKey: [...eventsKey, id],
    queryFn: async (): Promise<JobEvent | null> => {
      const { data, error } = await supabase.from('events').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

// 企業詳細の「予定・タスク」欄
export function useCompanyEventsAndTasks(companyId: string) {
  return useQuery({
    queryKey: ['company-plans', companyId],
    queryFn: async (): Promise<{ events: JobEvent[]; tasks: Task[] }> => {
      const [events, tasks] = await Promise.all([
        supabase.from('events').select('*').eq('company_id', companyId),
        supabase.from('tasks').select('*').eq('company_id', companyId),
      ])
      if (events.error) throw events.error
      if (tasks.error) throw tasks.error
      return { events: events.data, tasks: tasks.data }
    },
  })
}

// 予定・タスクを変えると、カレンダー・タスク・企業の欄・履歴の表示が変わる。まとめて読み直す
function usePlanMutation<T>(run: (input: T) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSettled: () =>
      Promise.all(
        [calendarKey, tasksKey, eventsKey, ['company-plans'], ['timeline']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
    onError: (error) => {
      if (isPermissionError(error)) void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

const notFound = { code: 'P0002', message: '見つかりません（削除されたか、ゴミ箱の企業に紐付いています）' }

type EventInsert = Database['public']['Tables']['events']['Insert']
type EventUpdate = Database['public']['Tables']['events']['Update']
type TaskInsert = Database['public']['Tables']['tasks']['Insert']
type TaskUpdate = Database['public']['Tables']['tasks']['Update']

export function useAddEvent() {
  return usePlanMutation(async (values: EventInsert) => {
    const { error } = await supabase.from('events').insert(values)
    if (error) throw error
  })
}

export function useUpdateEvent() {
  return usePlanMutation(async ({ id, values }: { id: string; values: EventUpdate }) => {
    const { data, error } = await supabase.from('events').update(values).eq('id', id).select('id')
    if (error) throw error
    if (data.length === 0) throw notFound
  })
}

export function useDeleteEvent() {
  return usePlanMutation(async (id: string) => {
    const { data, error } = await supabase.from('events').delete().eq('id', id).select('id')
    if (error) throw error
    if (data.length === 0) throw notFound
  })
}

export function useAddTask() {
  return usePlanMutation(async (values: TaskInsert) => {
    const { error } = await supabase.from('tasks').insert(values)
    if (error) throw error
  })
}

export function useUpdateTask() {
  return usePlanMutation(async ({ id, values }: { id: string; values: TaskUpdate }) => {
    const { data, error } = await supabase.from('tasks').update(values).eq('id', id).select('id')
    if (error) throw error
    if (data.length === 0) throw notFound
  })
}

export function useDeleteTask() {
  return usePlanMutation(async (id: string) => {
    const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id')
    if (error) throw error
    if (data.length === 0) throw notFound
  })
}

type ToggleInput = { table: 'events' | 'tasks'; id: string; done: boolean }
type PlansData = { events: JobEvent[]; tasks: Task[] }

// 完了・未完了の切替（予定は「参加済み」）。完了日時は今。
// チェックはすぐに表示へ反映し（楽観的更新、02 D4）、保存に失敗したら元に戻す
export function useToggleDone() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ table, id, done }: ToggleInput) => {
      const completed_at = done ? new Date().toISOString() : null
      const { data, error } = await supabase.from(table).update({ completed_at }).eq('id', id).select('id')
      if (error) throw error
      if (data.length === 0) throw notFound
    },
    onMutate: async ({ table, id, done }: ToggleInput) => {
      const keys = [calendarKey, tasksKey, ['company-plans']]
      await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })))
      const snapshot = keys.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }))
      const completed_at = done ? new Date().toISOString() : null
      queryClient.setQueryData<CalendarEntry[]>(calendarKey, (old) =>
        old?.map((e) => (e.source_table === table && e.source_id === id ? { ...e, done } : e)),
      )
      if (table === 'tasks')
        queryClient.setQueryData<Task[]>(tasksKey, (old) => old?.map((t) => (t.id === id ? { ...t, completed_at } : t)))
      queryClient.setQueriesData<PlansData>({ queryKey: ['company-plans'] }, (old) =>
        old
          ? {
              events: old.events.map((e) => (table === 'events' && e.id === id ? { ...e, completed_at } : e)),
              tasks: old.tasks.map((t) => (table === 'tasks' && t.id === id ? { ...t, completed_at } : t)),
            }
          : old,
      )
      return { snapshot }
    },
    onError: (error, _input, context) => {
      for (const [queryKey, data] of context?.snapshot ?? []) queryClient.setQueryData(queryKey, data)
      if (isPermissionError(error)) void queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onSettled: () =>
      Promise.all(
        [calendarKey, tasksKey, eventsKey, ['company-plans'], ['timeline']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  })
}
