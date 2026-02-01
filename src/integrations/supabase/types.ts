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
          created_at: string
          id: string
          maps_url: string | null
          name: string
          time: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          maps_url?: string | null
          name: string
          time: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          maps_url?: string | null
          name?: string
          time?: string
          updated_at?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          cnh: string
          created_at: string
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          cnh: string
          created_at?: string
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          cnh?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_boarding_locations: {
        Row: {
          boarding_location_id: string
          event_id: string
          id: string
        }
        Insert: {
          boarding_location_id: string
          event_id: string
          id?: string
        }
        Update: {
          boarding_location_id?: string
          event_id?: string
          id?: string
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
            foreignKeyName: "event_boarding_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          city: string
          created_at: string
          date: string
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["event_status"]
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["event_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          boarding_location_id: string
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
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["seller_status"]
          updated_at: string
        }
        Insert: {
          commission_percent?: number
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
        }
        Update: {
          commission_percent?: number
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          capacity: number
          created_at: string
          departure_time: string
          driver_id: string
          event_id: string
          id: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          capacity: number
          created_at?: string
          departure_time: string
          driver_id: string
          event_id: string
          id?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          capacity?: number
          created_at?: string
          departure_time?: string
          driver_id?: string
          event_id?: string
          id?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
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
          id: string
          role: Database["public"]["Enums"]["user_role"]
          seller_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          seller_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          seller_id?: string | null
          user_id?: string
        }
        Relationships: [
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
        Relationships: []
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
      get_user_seller_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      event_status: "rascunho" | "a_venda" | "encerrado"
      sale_status: "reservado" | "pago"
      seller_status: "ativo" | "inativo"
      user_role: "gerente" | "operador" | "vendedor"
      vehicle_type: "onibus" | "van"
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
      user_role: ["gerente", "operador", "vendedor"],
      vehicle_type: ["onibus", "van"],
    },
  },
} as const
