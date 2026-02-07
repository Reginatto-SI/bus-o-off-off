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
      boarding_locations: {
        Row: {
          address: string
          company_id: string
          created_at: string
          id: string
          maps_url: string | null
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          company_id: string
          created_at?: string
          id?: string
          maps_url?: string | null
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          company_id?: string
          created_at?: string
          id?: string
          maps_url?: string | null
          name?: string
          notes?: string | null
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
      companies: {
        Row: {
          address: string | null
          city: string | null
          cnpj: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          notes: string | null
          phone: string | null
          primary_color: string | null
          state: string | null
          trade_name: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          primary_color?: string | null
          state?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          primary_color?: string | null
          state?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          cnh: string
          cnh_category: string | null
          cnh_expires_at: string | null
          company_id: string
          cpf: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          cnh: string
          cnh_category?: string | null
          cnh_expires_at?: string | null
          company_id: string
          cpf?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          cnh?: string
          cnh_category?: string | null
          cnh_expires_at?: string | null
          company_id?: string
          cpf?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          status?: string
          updated_at?: string
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
      event_boarding_locations: {
        Row: {
          boarding_location_id: string
          company_id: string
          departure_time: string | null
          event_id: string
          id: string
          stop_order: number
          trip_id: string | null
        }
        Insert: {
          boarding_location_id: string
          company_id: string
          departure_time?: string | null
          event_id: string
          id?: string
          stop_order?: number
          trip_id?: string | null
        }
        Update: {
          boarding_location_id?: string
          company_id?: string
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
      events: {
        Row: {
          allow_online_sale: boolean
          allow_seller_sale: boolean
          city: string
          company_id: string
          created_at: string
          date: string
          description: string | null
          id: string
          max_tickets_per_purchase: number
          name: string
          status: Database["public"]["Enums"]["event_status"]
          unit_price: number
          updated_at: string
        }
        Insert: {
          allow_online_sale?: boolean
          allow_seller_sale?: boolean
          city: string
          company_id: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          max_tickets_per_purchase?: number
          name: string
          status?: Database["public"]["Enums"]["event_status"]
          unit_price?: number
          updated_at?: string
        }
        Update: {
          allow_online_sale?: boolean
          allow_seller_sale?: boolean
          city?: string
          company_id?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          max_tickets_per_purchase?: number
          name?: string
          status?: Database["public"]["Enums"]["event_status"]
          unit_price?: number
          updated_at?: string
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
          company_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
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
      sales: {
        Row: {
          boarding_location_id: string
          company_id: string
          created_at: string
          customer_cpf: string
          customer_name: string
          customer_phone: string
          event_id: string
          id: string
          quantity: number
          seller_id: string | null
          status: Database["public"]["Enums"]["sale_status"]
          trip_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          boarding_location_id: string
          company_id: string
          created_at?: string
          customer_cpf: string
          customer_name: string
          customer_phone: string
          event_id: string
          id?: string
          quantity: number
          seller_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          trip_id: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          boarding_location_id?: string
          company_id?: string
          created_at?: string
          customer_cpf?: string
          customer_name?: string
          customer_phone?: string
          event_id?: string
          id?: string
          quantity?: number
          seller_id?: string | null
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
      sellers: {
        Row: {
          commission_percent: number
          company_id: string
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["seller_status"]
          updated_at: string
        }
        Insert: {
          commission_percent?: number
          company_id: string
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
        }
        Update: {
          commission_percent?: number
          company_id?: string
          created_at?: string
          id?: string
          name?: string
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
          role: Database["public"]["Enums"]["user_role"]
          seller_id: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          driver_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          seller_id?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          driver_id?: string | null
          id?: string
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
          id: string
          model: string | null
          notes: string | null
          owner: string | null
          plate: string
          renavam: string | null
          status: Database["public"]["Enums"]["seller_status"]
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
          id?: string
          model?: string | null
          notes?: string | null
          owner?: string | null
          plate: string
          renavam?: string | null
          status?: Database["public"]["Enums"]["seller_status"]
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
          id?: string
          model?: string | null
          notes?: string | null
          owner?: string | null
          plate?: string
          renavam?: string | null
          status?: Database["public"]["Enums"]["seller_status"]
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      event_status: "rascunho" | "a_venda" | "encerrado"
      sale_status: "reservado" | "pago"
      seller_status: "ativo" | "inativo"
      user_role: "gerente" | "operador" | "vendedor" | "motorista"
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
      sale_status: ["reservado", "pago"],
      seller_status: ["ativo", "inativo"],
      user_role: ["gerente", "operador", "vendedor", "motorista"],
      vehicle_type: ["onibus", "van", "micro_onibus"],
    },
  },
} as const
