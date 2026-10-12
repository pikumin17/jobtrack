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
export type FinalOutcome =
  | 'offer'
  | 'offer_accepted'
  | 'offer_declined'
  | 'rejected'
  | 'withdrawn'
  | 'closed_other'

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
          application_type: string | null
          preference: number | null
          application_status: ApplicationStatus
          applied_on: string | null
          job_type: string | null
          location: string | null
          channel: string | null
          recruit_url: string | null
          mypage_url: string | null
          login_id_hint: string | null
          contact_person: string | null
          memo: string | null
          selection_status: SelectionStatus
          selection_status_reason: string | null
          final_outcome: FinalOutcome | null
          final_outcome_at: string | null
          closed_reason: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        // 登録時に指定できるのは利用者が編集できる列だけ（20261012000002 の列単位の権限）
        Insert: {
          name: string
          application_type?: string | null
          preference?: number | null
          application_status?: ApplicationStatus
          applied_on?: string | null
          job_type?: string | null
          location?: string | null
          channel?: string | null
          recruit_url?: string | null
          mypage_url?: string | null
          login_id_hint?: string | null
          contact_person?: string | null
          memo?: string | null
        }
        Update: Partial<Database['public']['Tables']['companies']['Insert']> & {
          final_outcome?: FinalOutcome | null
          final_outcome_at?: string | null
          closed_reason?: string | null
          deleted_at?: string | null
        }
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
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Company = Database['public']['Tables']['companies']['Row']
export type MemberRow = Database['public']['Functions']['admin_list_members']['Returns'][number]
