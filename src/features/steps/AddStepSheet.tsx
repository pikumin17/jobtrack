import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Sheet } from '@/components/ui/Sheet'
import { userFacingMessage } from '@/lib/errors'
import { useAddSteps } from './api'
import { stepLabelSchema } from './schema'
import { COMMON_FLOW, STEP_TEMPLATES, type StepTemplate } from './templates'

// ステップの追加。テンプレートから1件、またはよくある流れをまとめて（N-6）。名前は変えられる
export function AddStepSheet({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const add = useAddSteps(companyId)
  const [selected, setSelected] = useState<StepTemplate | null>(null)
  const [label, setLabel] = useState('')
  const [labelError, setLabelError] = useState<string | null>(null)

  async function addSteps(templates: StepTemplate[]) {
    try {
      await add.mutateAsync(templates)
      onClose()
    } catch {
      // add.error で表示
    }
  }

  function addOne() {
    if (!selected) return
    const parsed = stepLabelSchema.safeParse(label)
    if (!parsed.success) {
      setLabelError(parsed.error.issues[0]?.message ?? '名前を確認してください')
      return
    }
    void addSteps([{ kind: selected.kind, label: parsed.data }])
  }

  return (
    <Sheet title="ステップを追加" onClose={onClose} busy={add.isPending}>
      <div className="rounded-2xl bg-sage-100 p-4">
        <p className="text-sm font-semibold text-sage-800">よくある流れをまとめて追加</p>
        <p className="mt-1 text-sm text-sage-800">{COMMON_FLOW.map((t) => t.label).join(' → ')}</p>
        <p className="mt-1 text-xs text-muted">追加した後で、1件ずつ削除・並替できます。</p>
        <Button className="mt-3" onClick={() => void addSteps(COMMON_FLOW)} disabled={add.isPending}>
          まとめて追加
        </Button>
      </div>

      <p className="mt-5 text-sm font-semibold">1件ずつ追加</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="ステップの種類">
        {STEP_TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            aria-pressed={selected?.label === t.label}
            onClick={() => {
              setSelected(t)
              setLabel(t.label)
              setLabelError(null)
            }}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm aria-pressed:border-sage-700 aria-pressed:bg-sage-100 aria-pressed:font-semibold"
          >
            {t.label}
          </button>
        ))}
      </div>
      {selected && (
        <form
          className="mt-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            addOne()
          }}
        >
          <label htmlFor="new-step-label" className="text-sm font-semibold">
            名前
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="new-step-label"
              value={label}
              maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
              aria-invalid={!!labelError}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-cream px-3 text-base"
            />
            <Button type="submit" disabled={add.isPending}>
              追加
            </Button>
          </div>
          {labelError && <p className="mt-1 text-sm text-danger">{labelError}</p>}
        </form>
      )}
      {add.isError && (
        <div className="mt-3">
          <ErrorMessage message={userFacingMessage(add.error, '追加できませんでした。もう一度お試しください。')} />
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" onClick={onClose} disabled={add.isPending}>
          閉じる
        </Button>
      </div>
    </Sheet>
  )
}
