// データベースの型定義。supabase/migrations の SQL と一致させること。
// 本番に接続して自動生成はしない（本番の秘密情報を使わないため）。列を変えたら手で更新する。

export type ProfileRole = 'admin' | 'member'
export type ProfileStatus = 'active' | 'suspended'
export type ApplicationStatus = 'not_applied' | 'applied'
export type SelectionStatus =
  | 'not_started'
  | 'in_progress'
  | 'offer'
  | 'offer_accepted'
  | 'offer_declined'
  | 'rejected'
  | 'withdrawn'
  | 'closed_other'
  | 'needs_review'
export type FinalOutcome = 'offer' | 'offer_accepted' | 'offer_declined' | 'rejected' | 'withdrawn' | 'closed_other'
export type SelectionStatusReason = 'failed_and_withdrawn' | 'progress_after_failed' | 'progress_after_withdrawn'
export type ApplicationType = 'main' | 'internship' | 'early' | 'other'
export type Channel = 'company_site' | 'job_site' | 'reverse_offer' | 'agent' | 'school' | 'other'
export type ClosedReason =
  | 'rejected_document'
  | 'rejected_webtest'
  | 'rejected_interview'
  | 'withdrawn_other_offer'
  | 'withdrawn_lost_interest'
  | 'withdrawn_schedule'
  | 'offer_declined'
  | 'other'
// 20261013000002（B-5: 筆記試験を追加）
export type StepKind = 'es' | 'webtest' | 'aptitude' | 'written_exam' | 'gd' | 'interview' | 'casual' | 'other'
export type StepStatus =
  | 'not_started'
  | 'scheduled'
  | 'done'
  | 'awaiting_result'
  | 'passed'
  | 'failed'
  | 'withdrawn'
  | 'exempted'
export type TimelineEntityType = 'company' | 'step' | 'event' | 'task'
export type TimelineAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'application_changed'
  | 'outcome_changed'
  | 'preference_changed'
  | 'deleted'
  | 'restored'
  | 'trashed'
  | 'backup_restored'

export type DeleteAccountResult = {
  auth_user_deleted: boolean
  auth_log_entries_deleted: number | null
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: ProfileRole
          status: ProfileStatus
          display_name: string | null
          graduation_year: number | null
          purpose: string | null
          onboarding_completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: {
          display_name?: string | null
          graduation_year?: number | null
          purpose?: string | null
          onboarding_completed_at?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          id: string
          user_id: string
          name: string
          application_type: ApplicationType | null
          preference: number | null
          application_status: ApplicationStatus
          applied_on: string | null
          job_type: string | null
          location: string | null
          channel: Channel | null
          recruit_url: string | null
          mypage_url: string | null
          login_id_hint: string | null
          contact_person: string | null
          memo: string | null
          selection_status: SelectionStatus
          selection_status_reason: SelectionStatusReason | null
          final_outcome: FinalOutcome | null
          final_outcome_at: string | null
          closed_reason: ClosedReason | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        // 登録時に指定できるのは利用者が編集できる列だけ（20261012000002 の列単位の権限）
        Insert: {
          name: string
          application_type?: ApplicationType | null
          preference?: number | null
          application_status?: ApplicationStatus
          applied_on?: string | null
          job_type?: string | null
          location?: string | null
          channel?: Channel | null
          recruit_url?: string | null
          mypage_url?: string | null
          login_id_hint?: string | null
          contact_person?: string | null
          memo?: string | null
        }
        // 最終結果の記録日時（final_outcome_at）は DB が決める（20261013000002）。ゴミ箱は RPC で操作する
        Update: Partial<Database['public']['Tables']['companies']['Insert']> & {
          final_outcome?: FinalOutcome | null
          closed_reason?: ClosedReason | null
        }
        Relationships: []
      }
      // 20261013000002
      selection_steps: {
        Row: {
          id: string
          user_id: string
          company_id: string
          position: number
          kind: StepKind
          label: string
          status: StepStatus
          deadline_date: string | null
          deadline_at: string | null
          scheduled_at: string | null
          scheduled_end_at: string | null
          completed_at: string | null
          result_expected_on: string | null
          result_at: string | null
          place: string | null
          memo: string | null
          created_at: string
          updated_at: string
        }
        // 並び順は DB が末尾に付ける。並替は reorder_steps で行う
        Insert: {
          company_id: string
          kind: StepKind
          label: string
          status?: StepStatus
          deadline_date?: string | null
          deadline_at?: string | null
          scheduled_at?: string | null
          scheduled_end_at?: string | null
          completed_at?: string | null
          result_expected_on?: string | null
          result_at?: string | null
          place?: string | null
          memo?: string | null
        }
        Update: Partial<Omit<Database['public']['Tables']['selection_steps']['Insert'], 'company_id'>>
        Relationships: []
      }
      // 20261013000002。書き込むのは DB のトリガーだけ（利用者は読むだけ）
      timeline_entries: {
        Row: {
          id: string
          user_id: string
          company_id: string | null
          entity_type: TimelineEntityType
          entity_id: string | null
          action: TimelineAction
          summary: string
          before: Record<string, unknown> | null
          after: Record<string, unknown> | null
          occurred_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      notification_settings: {
        Row: {
          user_id: string
          email_enabled: boolean
          email_address: string | null
          email_verified_at: string | null
          types: string[]
          offsets_days: number[]
          send_hour_jst: number
          unsubscribe_token: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: {
          email_enabled?: boolean
          email_address?: string | null
          types?: string[]
          offsets_days?: number[]
          send_hour_jst?: number
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      admin_list_members: {
        Args: Record<PropertyKey, never>
        Returns: {
          email: string
          note: string | null
          invited_at: string
          revoked_at: string | null
          user_id: string | null
          role: ProfileRole | null
          status: ProfileStatus | null
          last_sign_in_at: string | null
        }[]
      }
      admin_invite: {
        Args: { p_email: string; p_note?: string | null }
        Returns: undefined
      }
      admin_revoke: {
        Args: { p_email: string }
        Returns: undefined
      }
      // 20261013000001。認証記録の削除権限がない環境では auth_log_entries_deleted が null
      admin_delete_account: {
        Args: { p_email: string; p_confirm_email: string }
        Returns: DeleteAccountResult
      }
      // 20261013000002。いずれも RLS の下で自分の企業だけを操作する
      reorder_steps: {
        Args: { p_company_id: string; p_step_ids: string[] }
        Returns: undefined
      }
      trash_company: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      restore_company: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      purge_company: {
        Args: { p_company_id: string }
        Returns: undefined
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Company = Database['public']['Tables']['companies']['Row']
export type SelectionStep = Database['public']['Tables']['selection_steps']['Row']
export type TimelineEntry = Database['public']['Tables']['timeline_entries']['Row']
export type MemberRow = Database['public']['Functions']['admin_list_members']['Returns'][number]
