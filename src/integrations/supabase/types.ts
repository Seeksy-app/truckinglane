export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_events: {
        Row: {
          account_id: string
          created_at: string
          event_type: string
          id: string
          meta: Json | null
        }
        Insert: {
          account_id: string
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
        }
        Update: {
          account_id?: string
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "account_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          agency_id: string
          ai_notes: string | null
          commodities: string[] | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          dot_number: string | null
          equipment_types: string[] | null
          fit_score: number | null
          fit_score_breakdown: Json | null
          fmcsa_data: Json | null
          id: string
          mc_number: string | null
          name: string
          notes: string | null
          regions: string[] | null
          source: string
          type: string
          updated_at: string
          website: string | null
        }
        Insert: {
          agency_id: string
          ai_notes?: string | null
          commodities?: string[] | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          dot_number?: string | null
          equipment_types?: string[] | null
          fit_score?: number | null
          fit_score_breakdown?: Json | null
          fmcsa_data?: Json | null
          id?: string
          mc_number?: string | null
          name: string
          notes?: string | null
          regions?: string[] | null
          source?: string
          type?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          agency_id?: string
          ai_notes?: string | null
          commodities?: string[] | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          dot_number?: string | null
          equipment_types?: string[] | null
          fit_score?: number | null
          fit_score_breakdown?: Json | null
          fmcsa_data?: Json | null
          id?: string
          mc_number?: string | null
          name?: string
          notes?: string | null
          regions?: string[] | null
          source?: string
          type?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agencies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_members: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_members_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_phone_numbers: {
        Row: {
          agency_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          phone_number: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_phone_numbers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_requests: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          agency_name: string
          agent_count: string | null
          approval_token: string | null
          city: string | null
          created_at: string
          daily_load_volume: string | null
          id: string
          owner_address: string | null
          owner_email: string
          owner_name: string
          owner_phone: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          agency_name: string
          agent_count?: string | null
          approval_token?: string | null
          city?: string | null
          created_at?: string
          daily_load_volume?: string | null
          id?: string
          owner_address?: string | null
          owner_email: string
          owner_name: string
          owner_phone?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          agency_name?: string
          agent_count?: string | null
          approval_token?: string | null
          city?: string | null
          created_at?: string
          daily_load_volume?: string | null
          id?: string
          owner_address?: string | null
          owner_email?: string
          owner_name?: string
          owner_phone?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      agent_daily_state: {
        Row: {
          aei_score: number
          agency_id: string
          agent_id: string
          ai_calls: number
          ai_minutes: number
          booked: number
          callback_speed_seconds: number
          created_at: string
          engaged_calls_today_ids: string[]
          high_intent: number
          id: string
          leads_today_ids: string[]
          local_date: string
          open_loads_today_ids: string[]
          quick_hangups_today_ids: string[]
          recent_calls_today_ids: string[]
          reset_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          aei_score?: number
          agency_id: string
          agent_id: string
          ai_calls?: number
          ai_minutes?: number
          booked?: number
          callback_speed_seconds?: number
          created_at?: string
          engaged_calls_today_ids?: string[]
          high_intent?: number
          id?: string
          leads_today_ids?: string[]
          local_date?: string
          open_loads_today_ids?: string[]
          quick_hangups_today_ids?: string[]
          recent_calls_today_ids?: string[]
          reset_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          aei_score?: number
          agency_id?: string
          agent_id?: string
          ai_calls?: number
          ai_minutes?: number
          booked?: number
          callback_speed_seconds?: number
          created_at?: string
          engaged_calls_today_ids?: string[]
          high_intent?: number
          id?: string
          leads_today_ids?: string[]
          local_date?: string
          open_loads_today_ids?: string[]
          quick_hangups_today_ids?: string[]
          recent_calls_today_ids?: string[]
          reset_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_daily_state_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_daily_state_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_daily_stats: {
        Row: {
          aei_score: number
          agency_id: string
          ai_minutes_saved: number
          avg_callback_seconds: number
          created_at: string
          high_intent_calls: number
          id: string
          stat_date: string
          total_calls: number
          updated_at: string
          user_id: string
        }
        Insert: {
          aei_score?: number
          agency_id: string
          ai_minutes_saved?: number
          avg_callback_seconds?: number
          created_at?: string
          high_intent_calls?: number
          id?: string
          stat_date?: string
          total_calls?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          aei_score?: number
          agency_id?: string
          ai_minutes_saved?: number
          avg_callback_seconds?: number
          created_at?: string
          high_intent_calls?: number
          id?: string
          stat_date?: string
          total_calls?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_daily_stats_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_daily_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_invites: {
        Row: {
          accepted_at: string | null
          agency_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_invites_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_call_summaries: {
        Row: {
          agency_id: string | null
          agent_id: string | null
          agent_number: string | null
          call_cost_credits: number | null
          call_outcome: string | null
          call_sid: string | null
          callback_speed_secs: number | null
          carrier_mc: string | null
          carrier_name: string | null
          carrier_usdot: string | null
          conversation_id: string
          created_at: string
          duration_secs: number | null
          ended_at: string | null
          external_number: string | null
          high_intent_reasons: Json | null
          id: string
          is_high_intent: boolean | null
          started_at: string | null
          summary: string | null
          summary_short: string | null
          summary_title: string | null
          termination_reason: string | null
          transcript: string | null
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          agent_id?: string | null
          agent_number?: string | null
          call_cost_credits?: number | null
          call_outcome?: string | null
          call_sid?: string | null
          callback_speed_secs?: number | null
          carrier_mc?: string | null
          carrier_name?: string | null
          carrier_usdot?: string | null
          conversation_id: string
          created_at?: string
          duration_secs?: number | null
          ended_at?: string | null
          external_number?: string | null
          high_intent_reasons?: Json | null
          id?: string
          is_high_intent?: boolean | null
          started_at?: string | null
          summary?: string | null
          summary_short?: string | null
          summary_title?: string | null
          termination_reason?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          agent_id?: string | null
          agent_number?: string | null
          call_cost_credits?: number | null
          call_outcome?: string | null
          call_sid?: string | null
          callback_speed_secs?: number | null
          carrier_mc?: string | null
          carrier_name?: string | null
          carrier_usdot?: string | null
          conversation_id?: string
          created_at?: string
          duration_secs?: number | null
          ended_at?: string | null
          external_number?: string | null
          high_intent_reasons?: Json | null
          id?: string
          is_high_intent?: boolean | null
          started_at?: string | null
          summary?: string | null
          summary_short?: string | null
          summary_title?: string | null
          termination_reason?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_call_summaries_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_intelligence: {
        Row: {
          agency_id: string
          ai_activity: Json | null
          ai_insights: Json | null
          carrier_name: string | null
          created_at: string
          fmcsa_data: Json | null
          fmcsa_fetched_at: string | null
          id: string
          last_call_at: string | null
          last_call_outcome: string | null
          last_verified_at: string | null
          mc: string | null
          out_of_service_flag: boolean | null
          updated_at: string
          usdot: string
        }
        Insert: {
          agency_id: string
          ai_activity?: Json | null
          ai_insights?: Json | null
          carrier_name?: string | null
          created_at?: string
          fmcsa_data?: Json | null
          fmcsa_fetched_at?: string | null
          id?: string
          last_call_at?: string | null
          last_call_outcome?: string | null
          last_verified_at?: string | null
          mc?: string | null
          out_of_service_flag?: boolean | null
          updated_at?: string
          usdot: string
        }
        Update: {
          agency_id?: string
          ai_activity?: Json | null
          ai_insights?: Json | null
          carrier_name?: string | null
          created_at?: string
          fmcsa_data?: Json | null
          fmcsa_fetched_at?: string | null
          id?: string
          last_call_at?: string | null
          last_call_outcome?: string | null
          last_verified_at?: string | null
          mc?: string | null
          out_of_service_flag?: boolean | null
          updated_at?: string
          usdot?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_intelligence_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          agency_id: string
          created_at: string
          created_by: string | null
          id: string
          is_dm: boolean | null
          name: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_dm?: boolean | null
          name: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_dm?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          channel_id: string
          created_at: string
          id: string
          mentions: Json | null
          sender_id: string
        }
        Insert: {
          body: string
          channel_id: string
          created_at?: string
          id?: string
          mentions?: Json | null
          sender_id: string
        }
        Update: {
          body?: string
          channel_id?: string
          created_at?: string
          id?: string
          mentions?: Json | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reads: {
        Row: {
          channel_id: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          elevenlabs_call_id: string | null
          id: string
          intent: string | null
          outcome: string | null
          phone_call_id: string
          raw_payload: Json | null
          recording_url: string | null
          sentiment: string | null
          summary: string | null
          transcript: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          elevenlabs_call_id?: string | null
          id?: string
          intent?: string | null
          outcome?: string | null
          phone_call_id: string
          raw_payload?: Json | null
          recording_url?: string | null
          sentiment?: string | null
          summary?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          elevenlabs_call_id?: string | null
          id?: string
          intent?: string | null
          outcome?: string | null
          phone_call_id?: string
          raw_payload?: Json | null
          recording_url?: string | null
          sentiment?: string | null
          summary?: string | null
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_phone_call_fk"
            columns: ["phone_call_id"]
            isOneToOne: false
            referencedRelation: "phone_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_phone_call_id_fkey"
            columns: ["phone_call_id"]
            isOneToOne: false
            referencedRelation: "phone_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      elevenlabs_post_calls: {
        Row: {
          agency_id: string | null
          agent_id: string | null
          agent_number: string | null
          branch_id: string | null
          call_duration_secs: number | null
          call_sid: string | null
          call_summary_title: string | null
          conversation_id: string | null
          created_at: string
          direction: string | null
          event_timestamp: number | null
          external_number: string | null
          id: string
          payload: Json
          status: string | null
          termination_reason: string | null
          transcript_summary: string | null
        }
        Insert: {
          agency_id?: string | null
          agent_id?: string | null
          agent_number?: string | null
          branch_id?: string | null
          call_duration_secs?: number | null
          call_sid?: string | null
          call_summary_title?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string | null
          event_timestamp?: number | null
          external_number?: string | null
          id?: string
          payload: Json
          status?: string | null
          termination_reason?: string | null
          transcript_summary?: string | null
        }
        Update: {
          agency_id?: string | null
          agent_id?: string | null
          agent_number?: string | null
          branch_id?: string | null
          call_duration_secs?: number | null
          call_sid?: string | null
          call_summary_title?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string | null
          event_timestamp?: number | null
          external_number?: string | null
          id?: string
          payload?: Json
          status?: string | null
          termination_reason?: string | null
          transcript_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "elevenlabs_post_calls_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      high_intent_keywords: {
        Row: {
          active: boolean
          agency_id: string
          agent_id: string | null
          case_sensitive: boolean
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          keyword: string
          keyword_type: string
          load_id: string | null
          match_type: string
          premium_response: string | null
          scope: string
          weight: number
        }
        Insert: {
          active?: boolean
          agency_id: string
          agent_id?: string | null
          case_sensitive?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          keyword: string
          keyword_type?: string
          load_id?: string | null
          match_type?: string
          premium_response?: string | null
          scope?: string
          weight?: number
        }
        Update: {
          active?: boolean
          agency_id?: string
          agent_id?: string | null
          case_sensitive?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          keyword?: string
          keyword_type?: string
          load_id?: string | null
          match_type?: string
          premium_response?: string | null
          scope?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "high_intent_keywords_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "high_intent_keywords_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "high_intent_keywords_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "high_intent_keywords_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_match_events: {
        Row: {
          agency_id: string
          agent_id: string | null
          booked_at: string | null
          created_at: string
          id: string
          keyword_id: string
          lead_id: string | null
          matched_text: string | null
          source: string
        }
        Insert: {
          agency_id: string
          agent_id?: string | null
          booked_at?: string | null
          created_at?: string
          id?: string
          keyword_id: string
          lead_id?: string | null
          matched_text?: string | null
          source: string
        }
        Update: {
          agency_id?: string
          agent_id?: string | null
          booked_at?: string | null
          created_at?: string
          id?: string
          keyword_id?: string
          lead_id?: string | null
          matched_text?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_match_events_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_match_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_match_events_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "high_intent_keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_match_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_suggestions: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          agency_id: string
          created_at: string
          id: string
          keyword: string
          keyword_type: string
          load_id: string | null
          status: string
          suggested_scope: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_id: string
          created_at?: string
          id?: string
          keyword: string
          keyword_type?: string
          load_id?: string | null
          status?: string
          suggested_scope?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          agency_id?: string
          created_at?: string
          id?: string
          keyword?: string
          keyword_type?: string
          load_id?: string | null
          status?: string
          suggested_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_suggestions_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_suggestions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_suggestions_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          agent_id: string | null
          created_at: string
          event_type: string
          id: string
          lead_id: string
          meta: Json | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          lead_id: string
          meta?: Json | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agency_id: string
          booked_at: string | null
          booked_by: string | null
          callback_requested_at: string | null
          caller_company: string | null
          caller_name: string | null
          caller_phone: string
          carrier_mc: string | null
          carrier_name: string | null
          carrier_usdot: string | null
          carrier_verified_at: string | null
          claimed_at: string | null
          claimed_by: string | null
          close_reason: string | null
          closed_at: string | null
          conversation_id: string | null
          created_at: string
          equipment_type: string | null
          follow_up_status: string | null
          id: string
          intent_reason_breakdown: Json | null
          intent_score: number | null
          is_high_intent: boolean | null
          last_contact_attempt_at: string | null
          load_id: string | null
          notes: string | null
          phone_call_id: string | null
          resolved_at: string | null
          shipper: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          agency_id: string
          booked_at?: string | null
          booked_by?: string | null
          callback_requested_at?: string | null
          caller_company?: string | null
          caller_name?: string | null
          caller_phone: string
          carrier_mc?: string | null
          carrier_name?: string | null
          carrier_usdot?: string | null
          carrier_verified_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          close_reason?: string | null
          closed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          equipment_type?: string | null
          follow_up_status?: string | null
          id?: string
          intent_reason_breakdown?: Json | null
          intent_score?: number | null
          is_high_intent?: boolean | null
          last_contact_attempt_at?: string | null
          load_id?: string | null
          notes?: string | null
          phone_call_id?: string | null
          resolved_at?: string | null
          shipper?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string
          booked_at?: string | null
          booked_by?: string | null
          callback_requested_at?: string | null
          caller_company?: string | null
          caller_name?: string | null
          caller_phone?: string
          carrier_mc?: string | null
          carrier_name?: string | null
          carrier_usdot?: string | null
          carrier_verified_at?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          close_reason?: string | null
          closed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          equipment_type?: string | null
          follow_up_status?: string | null
          id?: string
          intent_reason_breakdown?: Json | null
          intent_score?: number | null
          is_high_intent?: boolean | null
          last_contact_attempt_at?: string | null
          load_id?: string | null
          notes?: string | null
          phone_call_id?: string | null
          resolved_at?: string | null
          shipper?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_phone_call_id_fkey"
            columns: ["phone_call_id"]
            isOneToOne: false
            referencedRelation: "phone_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_pages: {
        Row: {
          content: string
          created_at: string
          id: string
          last_updated_by: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          last_updated_by?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          last_updated_by?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_pages_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      load_import_runs: {
        Row: {
          agency_id: string
          created_at: string
          file_name: string | null
          id: string
          replaced_count: number | null
          row_count: number | null
          template_type: string
          uploaded_by: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string
          file_name?: string | null
          id?: string
          replaced_count?: number | null
          row_count?: number | null
          template_type: string
          uploaded_by?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string
          file_name?: string | null
          id?: string
          replaced_count?: number | null
          row_count?: number | null
          template_type?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_import_runs_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      loads: {
        Row: {
          agency_id: string
          archived_at: string | null
          board_date: string
          booked_at: string | null
          booked_by: string | null
          booked_call_id: string | null
          booked_lead_id: string | null
          booked_source: string | null
          claimed_at: string | null
          claimed_by: string | null
          close_reason: string | null
          closed_at: string | null
          commission_max_pct: number
          commission_target_pct: number
          commodity: string | null
          created_at: string
          customer_invoice_total: number
          delivery_date: string | null
          dest_city: string | null
          dest_location_raw: string | null
          dest_state: string | null
          dest_zip: string | null
          dispatch_status: string | null
          id: string
          is_active: boolean
          is_high_intent: boolean | null
          is_per_ton: boolean
          load_call_script: string | null
          load_number: string
          max_commission: number | null
          max_pay: number
          miles: string | null
          pickup_city: string | null
          pickup_location_raw: string | null
          pickup_state: string | null
          pickup_zip: string | null
          rate_raw: number | null
          ship_date: string | null
          source_row: Json | null
          status: string
          target_commission: number | null
          target_pay: number
          tarp_required: boolean | null
          tarp_size: string | null
          tarps: string | null
          template_type: string
          trailer_footage: number | null
          trailer_type: string | null
          updated_at: string
          weight_lbs: number | null
        }
        Insert: {
          agency_id: string
          archived_at?: string | null
          board_date?: string
          booked_at?: string | null
          booked_by?: string | null
          booked_call_id?: string | null
          booked_lead_id?: string | null
          booked_source?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          close_reason?: string | null
          closed_at?: string | null
          commission_max_pct?: number
          commission_target_pct?: number
          commodity?: string | null
          created_at?: string
          customer_invoice_total: number
          delivery_date?: string | null
          dest_city?: string | null
          dest_location_raw?: string | null
          dest_state?: string | null
          dest_zip?: string | null
          dispatch_status?: string | null
          id?: string
          is_active?: boolean
          is_high_intent?: boolean | null
          is_per_ton?: boolean
          load_call_script?: string | null
          load_number: string
          max_commission?: number | null
          max_pay: number
          miles?: string | null
          pickup_city?: string | null
          pickup_location_raw?: string | null
          pickup_state?: string | null
          pickup_zip?: string | null
          rate_raw?: number | null
          ship_date?: string | null
          source_row?: Json | null
          status?: string
          target_commission?: number | null
          target_pay: number
          tarp_required?: boolean | null
          tarp_size?: string | null
          tarps?: string | null
          template_type: string
          trailer_footage?: number | null
          trailer_type?: string | null
          updated_at?: string
          weight_lbs?: number | null
        }
        Update: {
          agency_id?: string
          archived_at?: string | null
          board_date?: string
          booked_at?: string | null
          booked_by?: string | null
          booked_call_id?: string | null
          booked_lead_id?: string | null
          booked_source?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          close_reason?: string | null
          closed_at?: string | null
          commission_max_pct?: number
          commission_target_pct?: number
          commodity?: string | null
          created_at?: string
          customer_invoice_total?: number
          delivery_date?: string | null
          dest_city?: string | null
          dest_location_raw?: string | null
          dest_state?: string | null
          dest_zip?: string | null
          dispatch_status?: string | null
          id?: string
          is_active?: boolean
          is_high_intent?: boolean | null
          is_per_ton?: boolean
          load_call_script?: string | null
          load_number?: string
          max_commission?: number | null
          max_pay?: number
          miles?: string | null
          pickup_city?: string | null
          pickup_location_raw?: string | null
          pickup_state?: string | null
          pickup_zip?: string | null
          rate_raw?: number | null
          ship_date?: string | null
          source_row?: Json | null
          status?: string
          target_commission?: number | null
          target_pay?: number
          tarp_required?: boolean | null
          tarp_size?: string | null
          tarps?: string | null
          template_type?: string
          trailer_footage?: number | null
          trailer_type?: string | null
          updated_at?: string
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loads_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_booked_call_id_fkey"
            columns: ["booked_call_id"]
            isOneToOne: false
            referencedRelation: "phone_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_booked_lead_id_fkey"
            columns: ["booked_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loads_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          chat_badge: boolean | null
          chat_desktop: boolean | null
          chat_enabled: boolean | null
          chat_only_mentions: boolean | null
          chat_sound: boolean | null
          chat_unread_preview: boolean | null
          created_at: string
          email_enabled: boolean | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          sms_enabled: boolean | null
          sms_phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_badge?: boolean | null
          chat_desktop?: boolean | null
          chat_enabled?: boolean | null
          chat_only_mentions?: boolean | null
          chat_sound?: boolean | null
          chat_unread_preview?: boolean | null
          created_at?: string
          email_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sms_enabled?: boolean | null
          sms_phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_badge?: boolean | null
          chat_desktop?: boolean | null
          chat_enabled?: boolean | null
          chat_only_mentions?: boolean | null
          chat_sound?: boolean | null
          chat_unread_preview?: boolean | null
          created_at?: string
          email_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sms_enabled?: boolean | null
          sms_phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean | null
          meta: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          meta?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          meta?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_calls: {
        Row: {
          agency_id: string | null
          call_ended_at: string | null
          call_started_at: string | null
          call_status: Database["public"]["Enums"]["call_status"]
          caller_phone: string
          carrier_usdot: string | null
          created_at: string
          duration_seconds: number | null
          elevenlabs_call_id: string | null
          id: string
          receiver_phone: string
          twilio_call_sid: string | null
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          call_ended_at?: string | null
          call_started_at?: string | null
          call_status?: Database["public"]["Enums"]["call_status"]
          caller_phone: string
          carrier_usdot?: string | null
          created_at?: string
          duration_seconds?: number | null
          elevenlabs_call_id?: string | null
          id?: string
          receiver_phone: string
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          call_ended_at?: string | null
          call_started_at?: string | null
          call_status?: Database["public"]["Enums"]["call_status"]
          caller_phone?: string
          carrier_usdot?: string | null
          created_at?: string
          duration_seconds?: number | null
          elevenlabs_call_id?: string | null
          id?: string
          receiver_phone?: string
          twilio_call_sid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_calls_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_fingerprint: {
        Row: {
          created_at: string
          id: string
          note: string | null
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          source: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          source?: string
        }
        Relationships: []
      }
      prospecting_queue: {
        Row: {
          account_id: string
          agency_id: string
          created_at: string
          id: string
          priority: string
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          agency_id: string
          created_at?: string
          id?: string
          priority?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          agency_id?: string
          created_at?: string
          id?: string
          priority?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_queue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_queue_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      status_checks: {
        Row: {
          checked_at: string
          id: string
          latency_ms: number | null
          message: string | null
          meta: Json
          service: string
          status: string
        }
        Insert: {
          checked_at?: string
          id?: string
          latency_ms?: number | null
          message?: string | null
          meta?: Json
          service: string
          status: string
        }
        Update: {
          checked_at?: string
          id?: string
          latency_ms?: number | null
          message?: string | null
          meta?: Json
          service?: string
          status?: string
        }
        Relationships: []
      }
      status_incidents: {
        Row: {
          description: string | null
          id: string
          meta: Json
          resolved_at: string | null
          service: string
          severity: string
          started_at: string
          status: string
          title: string
        }
        Insert: {
          description?: string | null
          id?: string
          meta?: Json
          resolved_at?: string | null
          service: string
          severity: string
          started_at?: string
          status: string
          title: string
        }
        Update: {
          description?: string | null
          id?: string
          meta?: Json
          resolved_at?: string | null
          service?: string
          severity?: string
          started_at?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      system_alert_state: {
        Row: {
          id: string
          last_alerted_at: string | null
          last_status: string
          service_name: string
          updated_at: string
        }
        Insert: {
          id?: string
          last_alerted_at?: string | null
          last_status?: string
          service_name: string
          updated_at?: string
        }
        Update: {
          id?: string
          last_alerted_at?: string | null
          last_status?: string
          service_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_health_events: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          service_name: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          service_name: string
          status: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          service_name?: string
          status?: string
        }
        Relationships: []
      }
      trust_page_access_logs: {
        Row: {
          action: string
          created_at: string
          email: string
          id: string
          ip_address: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trust_page_access_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trust_page_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_page_sessions: {
        Row: {
          code: string
          code_expires_at: string
          created_at: string
          email: string
          id: string
          ip_address: string | null
          revoked_at: string | null
          session_expires_at: string | null
          user_agent: string | null
          verified_at: string | null
        }
        Insert: {
          code: string
          code_expires_at: string
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          revoked_at?: string | null
          session_expires_at?: string | null
          user_agent?: string | null
          verified_at?: string | null
        }
        Update: {
          code?: string
          code_expires_at?: string
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          revoked_at?: string | null
          session_expires_at?: string | null
          user_agent?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      trust_page_settings: {
        Row: {
          allowed_domains: string[] | null
          allowed_emails: string[] | null
          created_at: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          allowed_domains?: string[] | null
          allowed_emails?: string[] | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          allowed_domains?: string[] | null
          allowed_emails?: string[] | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          error: string | null
          event_type: string | null
          id: string
          payload: Json | null
          processed_at: string
          source: string
        }
        Insert: {
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string
          source: string
        }
        Update: {
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_status_latest: {
        Row: {
          checked_at: string | null
          latency_ms: number | null
          message: string | null
          service: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      analytics_kpis: {
        Args: {
          p_agency_id: string
          p_agent_id?: string
          p_end_ts?: string
          p_start_ts?: string
        }
        Returns: Json
      }
      attribute_booking_to_lead: {
        Args: { _agency_id: string; _lead_id?: string; _load_id: string }
        Returns: Json
      }
      count_agent_active_keywords: {
        Args: { _agent_id: string }
        Returns: number
      }
      count_agent_keyword_adds_today: {
        Args: { _agent_id: string }
        Returns: number
      }
      count_global_active_keywords: {
        Args: { _agency_id: string }
        Returns: number
      }
      get_agency_daily_report: {
        Args: { _agency_id: string; _date?: string }
        Returns: {
          ai_calls: number
          avg_sec_call_to_claim: number
          book_rate: number
          claim_rate: number
          close_rate: number
          leads_booked: number
          leads_claimed: number
          leads_closed: number
          leads_created: number
        }[]
      }
      get_keyword_analytics: {
        Args: { _agency_id: string; _days?: number }
        Returns: {
          booked_count: number
          conversion_rate: number
          keyword: string
          keyword_id: string
          keyword_type: string
          last_matched_at: string
          match_count: number
          scope: string
        }[]
      }
      get_metrics_summary: {
        Args: {
          p_agency_id: string
          p_agent_id?: string
          p_end_ts?: string
          p_start_ts?: string
        }
        Returns: Json
      }
      get_primary_agency_id: { Args: never; Returns: string }
      get_user_agency_id: { Args: { _user_id: string }; Returns: string }
      get_user_agency_id_secure: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_agent_daily_state: {
        Args: { _agency_id: string; _agent_id: string; _timezone?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "agent" | "agency_admin" | "super_admin" | "owner"
      call_status: "completed" | "failed" | "in_progress"
      lead_status: "pending" | "claimed" | "closed" | "booked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["agent", "agency_admin", "super_admin", "owner"],
      call_status: ["completed", "failed", "in_progress"],
      lead_status: ["pending", "claimed", "closed", "booked"],
    },
  },
} as const
