import { useQuery } from '@tanstack/react-query'
import type { TimelineEntry } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

// 履歴は DB のトリガーだけが書き、利用者は読むだけ（S-10）。RLS により自分の履歴だけが返る
export type TimelineItem = Pick<
  TimelineEntry,
  'id' | 'company_id' | 'entity_type' | 'action' | 'summary' | 'occurred_at'
>
const COLUMNS = 'id, company_id, entity_type, action, summary, occurred_at'

export function useCompanyTimeline(companyId: string) {
  return useQuery({
    queryKey: ['timeline', companyId],
    queryFn: async (): Promise<TimelineItem[]> => {
      const { data, error } = await supabase
        .from('timeline_entries')
        .select(COLUMNS)
        .eq('company_id', companyId)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(200)
      if (error) throw error
      return data
    },
  })
}

// 最近の更新（ホーム・詳細カードの最新の履歴1件）。詳細カードは最近の範囲に履歴がある企業だけに出す
export function useRecentTimeline(limit = 100, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['timeline', 'recent', limit],
    queryFn: async (): Promise<TimelineItem[]> => {
      const { data, error } = await supabase
        .from('timeline_entries')
        .select(COLUMNS)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
  })
}

// 企業ごとの最新の1件
export function latestByCompany(items: TimelineItem[]): Map<string, TimelineItem> {
  const map = new Map<string, TimelineItem>()
  for (const item of items) if (item.company_id && !map.has(item.company_id)) map.set(item.company_id, item)
  return map
}
