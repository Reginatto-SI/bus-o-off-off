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
      admin_notifications: {
        Row: {
          action_link: string | null
          company_id: string
          created_at: string
          dedupe_key: string | null
          id: string
          is_read: boolean
          message: string
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          severity: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          action_link?: string | null
          company_id: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          message: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          severity: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          action_link?: string | null
          company_id?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          message?: string
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          severity?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_webhook_event_dedup: {
        Row: {
          asaas_event_id: string
          duplicate_count: number
          event_type: string | null
          external_reference: string | null
          first_received_at: string
          last_payload_json: Json | null
          last_payment_environment: string | null
          last_sale_id: string | null
          last_seen_at: string
          payload_json: Json | null
          payment_environment: string | null
          payment_id: string | null
          sale_id: string | null
        }
        Insert: {
          asaas_event_id: string
          duplicate_count?: number
          event_type?: string | null
          external_reference?: string | null
          first_received_at?: string
          last_payload_json?: Json | null
          last_payment_environment?: string | null
          last_sale_id?: string | null
          last_seen_at?: string
          payload_json?: Json | null
          payment_environment?: string | null
          payment_id?: string | null
          sale_id?: string | null
        }
        Update: {
          asaas_event_id?: string
          duplicate_count?: number
          event_type?: string | null
          external_reference?: string | null
          first_received_at?: string
          last_payload_json?: Json | null
          last_payment_environment?: string | null
          last_sale_id?: string | null
          last_seen_at?: string
          payload_json?: Json | null
          payment_environment?: string | null
          payment_id?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asaas_webhook_event_dedup_last_sale_id_fkey"
            columns: ["last_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_webhook_event_dedup_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_program_eligible_cpf: {
        Row: {
          benefit_program_id: string
          company_id: string
          cpf: string
          created_at: string
          full_name: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          benefit_program_id: string
          company_id: string
          cpf: string
          created_at?: string
          full_name?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          benefit_program_id?: string
          company_id?: string
          cpf?: string
          created_at?: string
          full_name?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benefit_program_eligible_cpf_benefit_program_id_fkey"
            columns: ["benefit_program_id"]
            isOneToOne: false
            referencedRelation: "benefit_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_program_eligible_cpf_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_program_eligible_cpf_company_match_fk"
            columns: ["benefit_program_id", "company_id"]
            isOneToOne: false
            referencedRelation: "benefit_programs"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      benefit_program_event_links: {
        Row: {
          benefit_program_id: string
          company_id: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          benefit_program_id: string
          company_id: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          benefit_program_id?: string
          company_id?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_program_event_links_benefit_program_id_fkey"
            columns: ["benefit_program_id"]
            isOneToOne: false
            referencedRelation: "benefit_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_program_event_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_program_event_links_company_match_fk"
            columns: ["benefit_program_id", "company_id"]
            isOneToOne: false
            referencedRelation: "benefit_programs"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "benefit_program_event_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_programs: {
        Row: {
          applies_to_all_events: boolean
          benefit_type: string
          benefit_value: number
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applies_to_all_events?: boolean
          benefit_type: string
          benefit_value: number
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applies_to_all_events?: boolean
          benefit_type?: string
          benefit_value?: number
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benefit_programs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      boarding_locations: {
        Row: {
          address: string
          city: string | null
          company_id: string
          created_at: string
          id: string
          maps_url: string | null
          name: string
          notes: string | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          city?: string | null
          company_id: string
          created_at?: string
          id?: string
          maps_url?: string | null
          name: string
          notes?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string | null
          company_id?: string
          created_at?: string
          id?: string
          maps_url?: string | null
          name?: string
          notes?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boarding_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          normalized_name: string
          source: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          normalized_name?: string
          source?: string
          state: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string
          source?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      commercial_partners: {
        Row: {
          company_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          display_order: number
          id: string
          instagram_url: string | null
          logo_url: string | null
          name: string
          notes: string | null
          partner_tier: string
          show_on_event_page: boolean
          show_on_showcase: boolean
          show_on_ticket: boolean
          status: string
          updated_at: string
          website_url: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          company_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          display_order?: number
          id?: string
          instagram_url?: string | null
          logo_url?: string | null
          name: string
          notes?: string | null
          partner_tier?: string
          show_on_event_page?: boolean
          show_on_showcase?: boolean
          show_on_ticket?: boolean
          status?: string
          updated_at?: string
          website_url?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          company_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          display_order?: number
          id?: string
          instagram_url?: string | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          partner_tier?: string
          show_on_event_page?: boolean
          show_on_showcase?: boolean
          show_on_ticket?: boolean
          status?: string
          updated_at?: string
          website_url?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          accent_color: string | null
          address: string | null
          address_number: string | null
          allow_manual_boarding: boolean
          allow_manual_reservations: boolean
          asaas_account_email_production: string | null
          asaas_account_email_sandbox: string | null
          asaas_account_id_production: string | null
          asaas_account_id_sandbox: string | null
          asaas_api_key_production: string | null
          asaas_api_key_sandbox: string | null
          asaas_onboarding_complete_production: boolean
          asaas_onboarding_complete_sandbox: boolean
          asaas_pix_last_checked_at_production: string | null
          asaas_pix_last_checked_at_sandbox: string | null
          asaas_pix_last_error_production: string | null
          asaas_pix_last_error_sandbox: string | null
          asaas_pix_ready_production: boolean
          asaas_pix_ready_sandbox: boolean
          asaas_wallet_id_production: string | null
          asaas_wallet_id_sandbox: string | null
          background_style: string
          city: string | null
          cnpj: string | null
          cover_image_url: string | null
          created_at: string
          document: string | null
          document_number: string | null
          email: string | null
          hero_badge_labels: string[] | null
          id: string
          intro_text: string | null
          is_active: boolean
          legal_name: string | null
          legal_type: string
          logo_url: string | null
          manual_reservation_ttl_minutes: number
          name: string
          notes: string | null
          phone: string | null
          platform_fee_percent: number
          postal_code: string | null
          primary_color: string | null
          province: string | null
          public_slug: string | null
          referral_code: string
          slogan: string | null
          social_facebook: string | null
          social_instagram: string | null
          social_telegram: string | null
          social_tiktok: string | null
          social_twitter: string | null
          social_website: string | null
          social_youtube: string | null
          socio_split_percent: number
          state: string | null
          ticket_color: string | null
          trade_name: string | null
          updated_at: string
          use_default_cover: boolean
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          address_number?: string | null
          allow_manual_boarding?: boolean
          allow_manual_reservations?: boolean
          asaas_account_email_production?: string | null
          asaas_account_email_sandbox?: string | null
          asaas_account_id_production?: string | null
          asaas_account_id_sandbox?: string | null
          asaas_api_key_production?: string | null
          asaas_api_key_sandbox?: string | null
          asaas_onboarding_complete_production?: boolean
          asaas_onboarding_complete_sandbox?: boolean
          asaas_pix_last_checked_at_production?: string | null
          asaas_pix_last_checked_at_sandbox?: string | null
          asaas_pix_last_error_production?: string | null
          asaas_pix_last_error_sandbox?: string | null
          asaas_pix_ready_production?: boolean
          asaas_pix_ready_sandbox?: boolean
          asaas_wallet_id_production?: string | null
          asaas_wallet_id_sandbox?: string | null
          background_style?: string
          city?: string | null
          cnpj?: string | null
          cover_image_url?: string | null
          created_at?: string
          document?: string | null
          document_number?: string | null
          email?: string | null
          hero_badge_labels?: string[] | null
          id?: string
          intro_text?: string | null
          is_active?: boolean
          legal_name?: string | null
          legal_type?: string
          logo_url?: string | null
          manual_reservation_ttl_minutes?: number
          name: string
          notes?: string | null
          phone?: string | null
          platform_fee_percent?: number
          postal_code?: string | null
          primary_color?: string | null
          province?: string | null
          public_slug?: string | null
          referral_code: string
          slogan?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_telegram?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_website?: string | null
          social_youtube?: string | null
          socio_split_percent?: number
          state?: string | null
          ticket_color?: string | null
          trade_name?: string | null
          updated_at?: string
          use_default_cover?: boolean
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          address_number?: string | null
          allow_manual_boarding?: boolean
          allow_manual_reservations?: boolean
          asaas_account_email_production?: string | null
          asaas_account_email_sandbox?: string | null
          asaas_account_id_production?: string | null
          asaas_account_id_sandbox?: string | null
          asaas_api_key_production?: string | null
          asaas_api_key_sandbox?: string | null
          asaas_onboarding_complete_production?: boolean
          asaas_onboarding_complete_sandbox?: boolean
          asaas_pix_last_checked_at_production?: string | null
          asaas_pix_last_checked_at_sandbox?: string | null
          asaas_pix_last_error_production?: string | null
          asaas_pix_last_error_sandbox?: string | null
          asaas_pix_ready_production?: boolean
          asaas_pix_ready_sandbox?: boolean
          asaas_wallet_id_production?: string | null
          asaas_wallet_id_sandbox?: string | null
          background_style?: string
          city?: string | null
          cnpj?: string | null
          cover_image_url?: string | null
          created_at?: string
          document?: string | null
          document_number?: string | null
          email?: string | null
          hero_badge_labels?: string[] | null
          id?: string
          intro_text?: string | null
          is_active?: boolean
          legal_name?: string | null
          legal_type?: string
          logo_url?: string | null
          manual_reservation_ttl_minutes?: number
          name?: string
          notes?: string | null
          phone?: string | null
          platform_fee_percent?: number
          postal_code?: string | null
          primary_color?: string | null
          province?: string | null
          public_slug?: string | null
          referral_code?: string
          slogan?: string | null
          social_facebook?: string | null
          social_instagram?: string | null
          social_telegram?: string | null
          social_tiktok?: string | null
          social_twitter?: string | null
          social_website?: string | null
          social_youtube?: string | null
          socio_split_percent?: number
          state?: string | null
          ticket_color?: string | null
          trade_name?: string | null
          updated_at?: string
          use_default_cover?: boolean
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      company_referrals: {
        Row: {
          activated_at: string
          cancel_reason: string | null
          cancelled_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          eligible_at: string | null
          id: string
          paid_amount: number | null
          paid_at: string | null
          paid_by: string | null
          payment_note: string | null
          progress_platform_fee_amount: number
          referral_code: string
          referred_company_id: string
          referrer_company_id: string
          reward_amount: number
          status: string
          target_platform_fee_amount: number
          tracking_captured_at: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string
          cancel_reason?: string | null
          cancelled_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          eligible_at?: string | null
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          payment_note?: string | null
          progress_platform_fee_amount?: number
          referral_code: string
          referred_company_id: string
          referrer_company_id: string
          reward_amount?: number
          status?: string
          target_platform_fee_amount?: number
          tracking_captured_at?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string
          cancel_reason?: string | null
          cancelled_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          eligible_at?: string | null
          id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          payment_note?: string | null
          progress_platform_fee_amount?: number
          referral_code?: string
          referred_company_id?: string
          referrer_company_id?: string
          reward_amount?: number
          status?: string
          target_platform_fee_amount?: number
          tracking_captured_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_referrals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_referrals_referred_company_id_fkey"
            columns: ["referred_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_referrals_referrer_company_id_fkey"
            columns: ["referrer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          birth_date: string | null
          cep: string | null
          city: string | null
          cnh: string
          cnh_category: string | null
          cnh_expires_at: string | null
          company_id: string
          complement: string | null
          cpf: string | null
          created_at: string
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          name: string
          neighborhood: string | null
          notes: string | null
          number: string | null
          operational_role: string
          phone: string
          rg: string | null
          state: string | null
          status: string
          street: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          birth_date?: string | null
          cep?: string | null
          city?: string | null
          cnh: string
          cnh_category?: string | null
          cnh_expires_at?: string | null
          company_id: string
          complement?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          name: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          operational_role?: string
          phone: string
          rg?: string | null
          state?: string | null
          status?: string
          street?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          birth_date?: string | null
          cep?: string | null
          city?: string | null
          cnh?: string
          cnh_category?: string | null
          cnh_expires_at?: string | null
          company_id?: string
          complement?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          name?: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          operational_role?: string
          phone?: string
          rg?: string | null
          state?: string | null
          status?: string
          street?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      event_boarding_locations: {
        Row: {
          boarding_location_id: string
          company_id: string
          departure_date: string | null
          departure_time: string | null
          event_id: string
          id: string
          stop_order: number
          trip_id: string | null
        }
        Insert: {
          boarding_location_id: string
          company_id: string
          departure_date?: string | null
          departure_time?: string | null
          event_id: string
          id?: string
          stop_order?: number
          trip_id?: string | null
        }
        Update: {
          boarding_location_id?: string
          company_id?: string
          departure_date?: string | null
          departure_time?: string | null
          event_id?: string
          id?: string
          stop_order?: number
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_boarding_locations_boarding_location_id_fkey"
            columns: ["boarding_location_id"]
            isOneToOne: false
            referencedRelation: "boarding_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_boarding_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_boarding_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_boarding_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      event_category_prices: {
        Row: {
          category: string
          company_id: string
          created_at: string
          event_id: string
          id: string
          price: number
          updated_at: string
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          event_id: string
          id?: string
          price?: number
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          event_id?: string
          id?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_category_prices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_category_prices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_fees: {
        Row: {
          company_id: string
          created_at: string
          event_id: string
          fee_type: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          value: number
        }
        Insert: {
          company_id: string
          created_at?: string
          event_id: string
          fee_type?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          value?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          event_id?: string
          fee_type?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_fees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_fees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sponsors: {
        Row: {
          company_id: string
          created_at: string
          display_order: number
          event_id: string
          id: string
          show_on_event_page: boolean
          show_on_showcase: boolean
          show_on_ticket: boolean
          sponsor_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          show_on_event_page?: boolean
          show_on_showcase?: boolean
          show_on_ticket?: boolean
          sponsor_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          show_on_event_page?: boolean
          show_on_showcase?: boolean
          show_on_ticket?: boolean
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sponsors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sponsors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sponsors_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_online_sale: boolean
          allow_seller_sale: boolean
          boarding_tolerance_minutes: number | null
          city: string
          company_id: string
          created_at: string
          date: string
          description: string | null
          enable_checkout_validation: boolean
          event_category: string | null
          id: string
          image_url: string | null
          is_archived: boolean
          max_tickets_per_purchase: number
          name: string
          pass_platform_fee_to_customer: boolean
          platform_fee_terms_accepted: boolean
          platform_fee_terms_accepted_at: string | null
          platform_fee_terms_accepted_by: string | null
          platform_fee_terms_version: string | null
          public_info: string | null
          status: Database["public"]["Enums"]["event_status"]
          transport_policy: string
          unit_price: number
          updated_at: string
          use_category_pricing: boolean
        }
        Insert: {
          allow_online_sale?: boolean
          allow_seller_sale?: boolean
          boarding_tolerance_minutes?: number | null
          city: string
          company_id: string
          created_at?: string
          date: string
          description?: string | null
          enable_checkout_validation?: boolean
          event_category?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          max_tickets_per_purchase?: number
          name: string
          pass_platform_fee_to_customer?: boolean
          platform_fee_terms_accepted?: boolean
          platform_fee_terms_accepted_at?: string | null
          platform_fee_terms_accepted_by?: string | null
          platform_fee_terms_version?: string | null
          public_info?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          transport_policy?: string
          unit_price?: number
          updated_at?: string
          use_category_pricing?: boolean
        }
        Update: {
          allow_online_sale?: boolean
          allow_seller_sale?: boolean
          boarding_tolerance_minutes?: number | null
          city?: string
          company_id?: string
          created_at?: string
          date?: string
          description?: string | null
          enable_checkout_validation?: boolean
          event_category?: string | null
          id?: string
          image_url?: string | null
          is_archived?: boolean
          max_tickets_per_purchase?: number
          name?: string
          pass_platform_fee_to_customer?: boolean
          platform_fee_terms_accepted?: boolean
          platform_fee_terms_accepted_at?: string | null
          platform_fee_terms_accepted_by?: string | null
          platform_fee_terms_version?: string | null
          public_info?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          transport_policy?: string
          unit_price?: number
          updated_at?: string
          use_category_pricing?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cep: string | null
          city: string | null
          company_id: string | null
          complement: string | null
          cpf: string | null
          created_at: string
          email: string
          id: string
          name: string
          neighborhood: string | null
          notes: string | null
          number: string | null
          phone: string | null
          state: string | null
          status: string
          street: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          city?: string | null
          company_id?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          street?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          city?: string | null
          company_id?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          street?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_integration_logs: {
        Row: {
          asaas_event_id: string | null
          company_id: string | null
          created_at: string
          direction: string
          duration_ms: number | null
          environment_decision_source: string | null
          environment_host_detected: string | null
          event_type: string | null
          external_reference: string | null
          http_status: number | null
          id: string
          incident_code: string | null
          message: string | null
          payload_json: Json | null
          payment_environment: string | null
          payment_id: string | null
          processing_status: string
          provider: string
          response_json: Json | null
          result_category: string | null
          sale_id: string | null
          warning_code: string | null
        }
        Insert: {
          asaas_event_id?: string | null
          company_id?: string | null
          created_at?: string
          direction: string
          duration_ms?: number | null
          environment_decision_source?: string | null
          environment_host_detected?: string | null
          event_type?: string | null
          external_reference?: string | null
          http_status?: number | null
          id?: string
          incident_code?: string | null
          message?: string | null
          payload_json?: Json | null
          payment_environment?: string | null
          payment_id?: string | null
          processing_status: string
          provider: string
          response_json?: Json | null
          result_category?: string | null
          sale_id?: string | null
          warning_code?: string | null
        }
        Update: {
          asaas_event_id?: string | null
          company_id?: string | null
          created_at?: string
          direction?: string
          duration_ms?: number | null
          environment_decision_source?: string | null
          environment_host_detected?: string | null
          event_type?: string | null
          external_reference?: string | null
          http_status?: number | null
          id?: string
          incident_code?: string | null
          message?: string | null
          payload_json?: Json | null
          payment_environment?: string | null
          payment_id?: string | null
          processing_status?: string
          provider?: string
          response_json?: Json | null
          result_category?: string | null
          sale_id?: string | null
          warning_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_integration_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_integration_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          description: string
          id: string
          new_value: string | null
          old_value: string | null
          performed_by: string | null
          sale_id: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          description: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          performed_by?: string | null
          sale_id: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          performed_by?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_passengers: {
        Row: {
          benefit_applied: boolean
          benefit_program_id: string | null
          benefit_program_name: string | null
          benefit_type: string | null
          benefit_value: number | null
          company_id: string
          created_at: string
          discount_amount: number
          final_price: number
          id: string
          original_price: number
          passenger_cpf: string
          passenger_name: string
          passenger_phone: string | null
          pricing_rule_version: string
          sale_id: string
          seat_id: string | null
          seat_label: string
          sort_order: number
          trip_id: string
        }
        Insert: {
          benefit_applied?: boolean
          benefit_program_id?: string | null
          benefit_program_name?: string | null
          benefit_type?: string | null
          benefit_value?: number | null
          company_id: string
          created_at?: string
          discount_amount?: number
          final_price: number
          id?: string
          original_price: number
          passenger_cpf: string
          passenger_name: string
          passenger_phone?: string | null
          pricing_rule_version?: string
          sale_id: string
          seat_id?: string | null
          seat_label: string
          sort_order?: number
          trip_id: string
        }
        Update: {
          benefit_applied?: boolean
          benefit_program_id?: string | null
          benefit_program_name?: string | null
          benefit_type?: string | null
          benefit_value?: number | null
          company_id?: string
          created_at?: string
          discount_amount?: number
          final_price?: number
          id?: string
          original_price?: number
          passenger_cpf?: string
          passenger_name?: string
          passenger_phone?: string | null
          pricing_rule_version?: string
          sale_id?: string
          seat_id?: string | null
          seat_label?: string
          sort_order?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_passengers_benefit_program_id_fkey"
            columns: ["benefit_program_id"]
            isOneToOne: false
            referencedRelation: "benefit_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_passengers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_passengers_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_passengers_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_passengers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          asaas_payment_id: string | null
          asaas_payment_status: string | null
          asaas_transfer_id: string | null
          benefit_total_discount: number
          block_reason: string | null
          boarding_location_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          created_at: string
          customer_cpf: string
          customer_name: string
          customer_phone: string
          event_id: string
          gross_amount: number | null
          id: string
          intermediation_responsibility_accepted: boolean
          intermediation_responsibility_accepted_at: string | null
          payment_confirmed_at: string | null
          payment_environment: string
          payment_method: string | null
          platform_fee_amount: number | null
          platform_fee_paid_at: string | null
          platform_fee_payment_id: string | null
          platform_fee_status: string
          platform_fee_total: number | null
          platform_net_amount: number | null
          quantity: number
          reservation_expires_at: string | null
          sale_origin: string
          seller_id: string | null
          socio_fee_amount: number | null
          status: Database["public"]["Enums"]["sale_status"]
          trip_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          asaas_payment_id?: string | null
          asaas_payment_status?: string | null
          asaas_transfer_id?: string | null
          benefit_total_discount?: number
          block_reason?: string | null
          boarding_location_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          created_at?: string
          customer_cpf: string
          customer_name: string
          customer_phone: string
          event_id: string
          gross_amount?: number | null
          id?: string
          intermediation_responsibility_accepted?: boolean
          intermediation_responsibility_accepted_at?: string | null
          payment_confirmed_at?: string | null
          payment_environment: string
          payment_method?: string | null
          platform_fee_amount?: number | null
          platform_fee_paid_at?: string | null
          platform_fee_payment_id?: string | null
          platform_fee_status?: string
          platform_fee_total?: number | null
          platform_net_amount?: number | null
          quantity: number
          reservation_expires_at?: string | null
          sale_origin?: string
          seller_id?: string | null
          socio_fee_amount?: number | null
          status?: Database["public"]["Enums"]["sale_status"]
          trip_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          asaas_payment_id?: string | null
          asaas_payment_status?: string | null
          asaas_transfer_id?: string | null
          benefit_total_discount?: number
          block_reason?: string | null
          boarding_location_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          created_at?: string
          customer_cpf?: string
          customer_name?: string
          customer_phone?: string
          event_id?: string
          gross_amount?: number | null
          id?: string
          intermediation_responsibility_accepted?: boolean
          intermediation_responsibility_accepted_at?: string | null
          payment_confirmed_at?: string | null
          payment_environment?: string
          payment_method?: string | null
          platform_fee_amount?: number | null
          platform_fee_paid_at?: string | null
          platform_fee_payment_id?: string | null
          platform_fee_status?: string
          platform_fee_total?: number | null
          platform_net_amount?: number | null
          quantity?: number
          reservation_expires_at?: string | null
          sale_origin?: string
          seller_id?: string | null
          socio_fee_amount?: number | null
          status?: Database["public"]["Enums"]["sale_status"]
          trip_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_boarding_location_id_fkey"
            columns: ["boarding_location_id"]
            isOneToOne: false
            referencedRelation: "boarding_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_locks: {
        Row: {
          company_id: string
          expires_at: string
          id: string
          locked_at: string
          sale_id: string | null
          seat_id: string
          trip_id: string
        }
        Insert: {
          company_id: string
          expires_at: string
          id?: string
          locked_at?: string
          sale_id?: string | null
          seat_id: string
          trip_id: string
        }
        Update: {
          company_id?: string
          expires_at?: string
          id?: string
          locked_at?: string
          sale_id?: string | null
          seat_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_locks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_locks_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_locks_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_locks_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          category: string
          column_number: number
          company_id: string
          created_at: string
          floor: number
          id: string
          label: string
          row_number: number
          status: string
          vehicle_id: string
        }
        Insert: {
          category?: string
          column_number: number
          company_id: string
          created_at?: string
          floor?: number
          id?: string
          label: string
          row_number: number
          status?: string
          vehicle_id: string
        }
        Update: {
          category?: string
          column_number?: number
          company_id?: string
          created_at?: string
          floor?: number
          id?: string
          label?: string
          row_number?: number
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          commission_percent: number
          company_id: string
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          pix_key: string | null
          short_code: string
          status: Database["public"]["Enums"]["seller_status"]
          updated_at: string
        }
        Insert: {
          commission_percent?: number
          company_id: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          short_code?: string
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
        }
        Update: {
          commission_percent?: number
          company_id?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          pix_key?: string | null
          short_code?: string
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sellers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      socios_split: {
        Row: {
          asaas_wallet_id: string | null
          asaas_wallet_id_production: string | null
          asaas_wallet_id_sandbox: string | null
          commission_percent: number
          company_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asaas_wallet_id?: string | null
          asaas_wallet_id_production?: string | null
          asaas_wallet_id_sandbox?: string | null
          commission_percent?: number
          company_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asaas_wallet_id?: string | null
          asaas_wallet_id_production?: string | null
          asaas_wallet_id_sandbox?: string | null
          commission_percent?: number
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "socios_split_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          banner_url: string | null
          carousel_order: number
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          link_type: string
          name: string
          site_url: string | null
          status: string
          updated_at: string
          whatsapp_message: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          banner_url?: string | null
          carousel_order?: number
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          link_type?: string
          name: string
          site_url?: string | null
          status?: string
          updated_at?: string
          whatsapp_message?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          banner_url?: string | null
          carousel_order?: number
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          link_type?: string
          name?: string
          site_url?: string | null
          status?: string
          updated_at?: string
          whatsapp_message?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      template_layout_items: {
        Row: {
          category: string
          column_number: number
          created_at: string
          floor_number: number
          id: string
          is_blocked: boolean
          row_number: number
          seat_number: string | null
          tags: string[]
          template_layout_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          column_number: number
          created_at?: string
          floor_number: number
          id?: string
          is_blocked?: boolean
          row_number: number
          seat_number?: string | null
          tags?: string[]
          template_layout_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          column_number?: number
          created_at?: string
          floor_number?: number
          id?: string
          is_blocked?: boolean
          row_number?: number
          seat_number?: string | null
          tags?: string[]
          template_layout_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_layout_items_template_layout_id_fkey"
            columns: ["template_layout_id"]
            isOneToOne: false
            referencedRelation: "template_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      template_layout_versions: {
        Row: {
          created_at: string
          id: string
          layout_snapshot: Json
          notes: string | null
          template_layout_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          layout_snapshot: Json
          notes?: string | null
          template_layout_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          layout_snapshot?: Json
          notes?: string | null
          template_layout_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_layout_versions_template_layout_id_fkey"
            columns: ["template_layout_id"]
            isOneToOne: false
            referencedRelation: "template_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      template_layouts: {
        Row: {
          created_at: string
          current_version: number
          description: string | null
          floors: number
          grid_columns: number
          grid_rows: number
          id: string
          name: string
          status: Database["public"]["Enums"]["seller_status"]
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          created_at?: string
          current_version?: number
          description?: string | null
          floors?: number
          grid_columns?: number
          grid_rows?: number
          id?: string
          name: string
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
          vehicle_type: string
        }
        Update: {
          created_at?: string
          current_version?: number
          description?: string | null
          floors?: number
          grid_columns?: number
          grid_rows?: number
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      ticket_validations: {
        Row: {
          action: string
          app_version: string | null
          boarding_location_id: string | null
          company_id: string
          device_info: string | null
          event_id: string | null
          id: string
          reason_code: string
          result: string
          sale_id: string | null
          ticket_id: string | null
          trip_id: string | null
          validated_at: string
          validated_by_driver_id: string | null
          validated_by_user_id: string | null
          validation_source: string
        }
        Insert: {
          action: string
          app_version?: string | null
          boarding_location_id?: string | null
          company_id: string
          device_info?: string | null
          event_id?: string | null
          id?: string
          reason_code: string
          result: string
          sale_id?: string | null
          ticket_id?: string | null
          trip_id?: string | null
          validated_at?: string
          validated_by_driver_id?: string | null
          validated_by_user_id?: string | null
          validation_source?: string
        }
        Update: {
          action?: string
          app_version?: string | null
          boarding_location_id?: string | null
          company_id?: string
          device_info?: string | null
          event_id?: string | null
          id?: string
          reason_code?: string
          result?: string
          sale_id?: string | null
          ticket_id?: string | null
          trip_id?: string | null
          validated_at?: string
          validated_by_driver_id?: string | null
          validated_by_user_id?: string | null
          validation_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_validations_boarding_location_id_fkey"
            columns: ["boarding_location_id"]
            isOneToOne: false
            referencedRelation: "boarding_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_validations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_validations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_validations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_validations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_validations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_validations_validated_by_driver_id_fkey"
            columns: ["validated_by_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          benefit_applied: boolean
          benefit_program_id: string | null
          benefit_program_name: string | null
          benefit_type: string | null
          benefit_value: number | null
          boarding_status: string
          company_id: string
          created_at: string
          discount_amount: number
          final_price: number
          id: string
          original_price: number
          passenger_cpf: string
          passenger_name: string
          passenger_phone: string | null
          pricing_rule_version: string
          qr_code_token: string
          sale_id: string
          seat_id: string | null
          seat_label: string
          ticket_number: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          benefit_applied?: boolean
          benefit_program_id?: string | null
          benefit_program_name?: string | null
          benefit_type?: string | null
          benefit_value?: number | null
          boarding_status?: string
          company_id: string
          created_at?: string
          discount_amount?: number
          final_price: number
          id?: string
          original_price: number
          passenger_cpf: string
          passenger_name: string
          passenger_phone?: string | null
          pricing_rule_version?: string
          qr_code_token?: string
          sale_id: string
          seat_id?: string | null
          seat_label: string
          ticket_number?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          benefit_applied?: boolean
          benefit_program_id?: string | null
          benefit_program_name?: string | null
          benefit_type?: string | null
          benefit_value?: number | null
          boarding_status?: string
          company_id?: string
          created_at?: string
          discount_amount?: number
          final_price?: number
          id?: string
          original_price?: number
          passenger_cpf?: string
          passenger_name?: string
          passenger_phone?: string | null
          pricing_rule_version?: string
          qr_code_token?: string
          sale_id?: string
          seat_id?: string | null
          seat_label?: string
          ticket_number?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_benefit_program_id_fkey"
            columns: ["benefit_program_id"]
            isOneToOne: false
            referencedRelation: "benefit_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          assistant_driver_id: string | null
          capacity: number
          company_id: string
          created_at: string
          departure_time: string | null
          driver_id: string
          event_id: string
          id: string
          paired_trip_id: string | null
          trip_type: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          assistant_driver_id?: string | null
          capacity: number
          company_id: string
          created_at?: string
          departure_time?: string | null
          driver_id: string
          event_id: string
          id?: string
          paired_trip_id?: string | null
          trip_type?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          assistant_driver_id?: string | null
          capacity?: number
          company_id?: string
          created_at?: string
          departure_time?: string | null
          driver_id?: string
          event_id?: string
          id?: string
          paired_trip_id?: string | null
          trip_type?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_assistant_driver_id_fkey"
            columns: ["assistant_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_paired_trip_id_fkey"
            columns: ["paired_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          driver_id: string | null
          id: string
          operational_role: string | null
          role: Database["public"]["Enums"]["user_role"]
          seller_id: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          driver_id?: string | null
          id?: string
          operational_role?: string | null
          role: Database["public"]["Enums"]["user_role"]
          seller_id?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          driver_id?: string | null
          id?: string
          operational_role?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          seller_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brand: string | null
          capacity: number
          chassis: string | null
          color: string | null
          company_id: string
          created_at: string
          floors: number
          id: string
          layout_snapshot: Json | null
          model: string | null
          notes: string | null
          owner: string | null
          plate: string
          renavam: string | null
          seats_left_side: number
          seats_right_side: number
          status: Database["public"]["Enums"]["seller_status"]
          template_layout_id: string | null
          template_layout_version: number | null
          type: Database["public"]["Enums"]["vehicle_type"]
          updated_at: string
          whatsapp_group_link: string | null
          year_model: number | null
        }
        Insert: {
          brand?: string | null
          capacity: number
          chassis?: string | null
          color?: string | null
          company_id: string
          created_at?: string
          floors?: number
          id?: string
          layout_snapshot?: Json | null
          model?: string | null
          notes?: string | null
          owner?: string | null
          plate: string
          renavam?: string | null
          seats_left_side?: number
          seats_right_side?: number
          status?: Database["public"]["Enums"]["seller_status"]
          template_layout_id?: string | null
          template_layout_version?: number | null
          type: Database["public"]["Enums"]["vehicle_type"]
          updated_at?: string
          whatsapp_group_link?: string | null
          year_model?: number | null
        }
        Update: {
          brand?: string | null
          capacity?: number
          chassis?: string | null
          color?: string | null
          company_id?: string
          created_at?: string
          floors?: number
          id?: string
          layout_snapshot?: Json | null
          model?: string | null
          notes?: string | null
          owner?: string | null
          plate?: string
          renavam?: string | null
          seats_left_side?: number
          seats_right_side?: number
          status?: Database["public"]["Enums"]["seller_status"]
          template_layout_id?: string | null
          template_layout_version?: number | null
          type?: Database["public"]["Enums"]["vehicle_type"]
          updated_at?: string
          whatsapp_group_link?: string | null
          year_model?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_template_layout_id_fkey"
            columns: ["template_layout_id"]
            isOneToOne: false
            referencedRelation: "template_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      correct_sale_passenger: {
        Args: {
          p_company_id: string
          p_cpf_reason: string
          p_new_cpf: string
          p_new_name: string
          p_new_phone: string
          p_ticket_id: string
        }
        Returns: undefined
      }
      create_admin_notification: {
        Args: {
          p_action_link?: string
          p_company_id: string
          p_dedupe_key?: string
          p_message: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_severity?: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_event_starting_soon_notifications: {
        Args: { p_company_id: string; p_window_hours?: number }
        Returns: number
      }
      get_benefit_eligibility_matches: {
        Args: {
          p_company_id: string
          p_cpf: string
          p_event_id: string
          p_reference_date?: string
        }
        Returns: {
          applies_to_all_events: boolean
          benefit_type: string
          benefit_value: number
          cpf: string
          cpf_created_at: string
          cpf_full_name: string
          cpf_notes: string
          cpf_record_company_id: string
          cpf_record_id: string
          cpf_record_program_id: string
          cpf_status: string
          cpf_updated_at: string
          cpf_valid_from: string
          cpf_valid_until: string
          program_company_id: string
          program_created_at: string
          program_description: string
          program_id: string
          program_name: string
          program_status: string
          program_updated_at: string
          program_valid_from: string
          program_valid_until: string
        }[]
      }
      get_boarding_manifest_rows: {
        Args: { p_company_id: string; p_event_id: string; p_trip_id?: string }
        Returns: {
          boarding_location_id: string
          boarding_location_name: string
          departure_time: string
          event_date: string
          event_id: string
          event_name: string
          passenger_cpf: string
          passenger_name: string
          passenger_phone: string
          sale_id: string
          seat_label: string
          stop_order: number
          ticket_id: string
          trip_departure_time: string
          trip_id: string
          vehicle_plate: string
          vehicle_type: string
        }[]
      }
      get_sales_report_kpis: {
        Args: {
          p_company_id?: string
          p_date_from?: string
          p_date_to?: string
          p_event_id?: string
          p_search?: string
          p_seller_id?: string
          p_status?: Database["public"]["Enums"]["sale_status"]
        }
        Returns: {
          cancelled_sales: number
          gross_revenue: number
          paid_sales: number
          platform_fee: number
          sellers_commission: number
          total_sales: number
        }[]
      }
      get_sales_report_summary_paginated: {
        Args: {
          p_company_id?: string
          p_date_from?: string
          p_date_to?: string
          p_event_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_seller_id?: string
          p_status?: Database["public"]["Enums"]["sale_status"]
        }
        Returns: {
          cancelled_sales: number
          event_date: string
          event_id: string
          event_name: string
          gross_revenue: number
          paid_sales: number
          platform_fee: number
          sellers_commission: number
          total_count: number
          total_sales: number
        }[]
      }
      get_sellers_commission_kpis: {
        Args: {
          p_company_id?: string
          p_date_from?: string
          p_date_to?: string
          p_event_id?: string
          p_search?: string
          p_seller_id?: string
          p_status?: Database["public"]["Enums"]["sale_status"]
        }
        Returns: {
          eligible_revenue: number
          eligible_sales: number
          sellers_count: number
          total_commission: number
          total_tickets: number
        }[]
      }
      get_sellers_commission_summary_paginated: {
        Args: {
          p_company_id?: string
          p_date_from?: string
          p_date_to?: string
          p_event_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_seller_id?: string
          p_status?: Database["public"]["Enums"]["sale_status"]
        }
        Returns: {
          commission_percent: number
          eligible_revenue: number
          eligible_sales: number
          seller_id: string
          seller_name: string
          total_commission: number
          total_count: number
          total_tickets: number
        }[]
      }
      get_trip_available_capacity: {
        Args: { trip_uuid: string }
        Returns: number
      }
      get_user_active_company: { Args: { _user_id: string }; Returns: string }
      get_user_seller_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_company_public_slug_available: {
        Args: { current_company_id?: string; input_slug: string }
        Returns: boolean
      }
      is_developer: { Args: { _user_id: string }; Returns: boolean }
      is_event_public_ticket_lookup_eligible: {
        Args: { event_row: Database["public"]["Tables"]["events"]["Row"] }
        Returns: boolean
      }
      mark_asaas_webhook_event_duplicate: {
        Args: {
          p_asaas_event_id: string
          p_payload_json?: Json
          p_payment_environment?: string
          p_sale_id?: string
        }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_city_name: { Args: { input: string }; Returns: string }
      normalize_public_slug: { Args: { input_slug: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_company_referral_progress: {
        Args: { p_referred_company_id?: string }
        Returns: number
      }
      resolve_company_referral_code: { Args: { code: string }; Returns: string }
      resolve_event_seller_ref: {
        Args: { p_company_id: string; p_seller_id: string }
        Returns: string
      }
      resolve_seller_short_code: { Args: { code: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      validate_ticket_scan:
        | {
            Args: {
              p_action: string
              p_app_version?: string
              p_device_info?: string
              p_qr_code_token: string
            }
            Returns: {
              boarding_label: string
              boarding_status: string
              checkout_enabled: boolean
              event_name: string
              passenger_cpf_masked: string
              passenger_name: string
              reason_code: string
              result: string
              seat_label: string
            }[]
          }
        | {
            Args: {
              p_action: string
              p_app_version?: string
              p_device_info?: string
              p_qr_code_token: string
              p_source?: string
            }
            Returns: {
              boarding_label: string
              boarding_status: string
              checkout_enabled: boolean
              event_name: string
              passenger_cpf_masked: string
              passenger_name: string
              reason_code: string
              result: string
              seat_label: string
            }[]
          }
    }
    Enums: {
      event_status: "rascunho" | "a_venda" | "encerrado"
      sale_status:
        | "pendente_pagamento"
        | "reservado"
        | "pago"
        | "cancelado"
        | "bloqueado"
      seller_status: "ativo" | "inativo"
      user_role: "gerente" | "operador" | "vendedor" | "motorista" | "developer"
      vehicle_type: "onibus" | "van" | "micro_onibus"
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
      event_status: ["rascunho", "a_venda", "encerrado"],
      sale_status: [
        "pendente_pagamento",
        "reservado",
        "pago",
        "cancelado",
        "bloqueado",
      ],
      seller_status: ["ativo", "inativo"],
      user_role: ["gerente", "operador", "vendedor", "motorista", "developer"],
      vehicle_type: ["onibus", "van", "micro_onibus"],
    },
  },
} as const
