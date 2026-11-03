import { useMemo } from 'react'
import { useAllSteps, type StepSummaryRow } from '@/features/steps/api'
import { summarizeCompany } from '@/lib/companySummary'
import { inputWarnings, loadDismissed } from '@/lib/inputWarnings'
import { useCompanies } from './api'
import type { ListRow } from './listQuery'

// 一覧・ホーム用: 企業ごとに結果待ち・次回予定・注意・入力警告の件数を求める（表示のたびに計算、保存しない）
export function useCompanyRows(now?: Date) {
  const companies = useCompanies()
  const steps = useAllSteps()
  const rows = useMemo((): ListRow[] | undefined => {
    if (!companies.data || !steps.data) return undefined
    const dismissed = loadDismissed()
    const byCompany = new Map<string, StepSummaryRow[]>()
    for (const s of steps.data) byCompany.set(s.company_id, [...(byCompany.get(s.company_id) ?? []), s])
    return companies.data.map((company) => {
      const own = byCompany.get(company.id) ?? []
      return {
        company,
        summary: summarizeCompany(company, own, now),
        warningCount: inputWarnings(company, own, now).filter((w) => !dismissed.has(w.fingerprint)).length,
      }
    })
  }, [companies.data, steps.data, now])
  return { rows, isError: companies.isError || steps.isError }
}
