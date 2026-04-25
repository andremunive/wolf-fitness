// Generado con mcp supabase generate_typescript_types.
// Refleja el estado de la base tras el Hito 3 (clients module).
// NO editar a mano. Regenerar cuando el esquema cambie.

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_body_measurements: {
        Row: {
          body_fat_pct: number | null
          chest_cm: number | null
          client_id: string
          created_at: string
          height_cm: number | null
          hips_cm: number | null
          id: string
          left_arm_cm: number | null
          left_thigh_cm: number | null
          measured_at: string
          measured_by: string | null
          notes: string | null
          right_arm_cm: number | null
          right_thigh_cm: number | null
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          chest_cm?: number | null
          client_id: string
          created_at?: string
          height_cm?: number | null
          hips_cm?: number | null
          id?: string
          left_arm_cm?: number | null
          left_thigh_cm?: number | null
          measured_at?: string
          measured_by?: string | null
          notes?: string | null
          right_arm_cm?: number | null
          right_thigh_cm?: number | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          chest_cm?: number | null
          client_id?: string
          created_at?: string
          height_cm?: number | null
          hips_cm?: number | null
          id?: string
          left_arm_cm?: number | null
          left_thigh_cm?: number | null
          measured_at?: string
          measured_by?: string | null
          notes?: string | null
          right_arm_cm?: number | null
          right_thigh_cm?: number | null
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cbm_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cbm_measured_by_fkey"
            columns: ["measured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_plan_history: {
        Row: {
          changed_by: string | null
          client_id: string
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          plan_id: string
          started_at: string
        }
        Insert: {
          changed_by?: string | null
          client_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          started_at?: string
        }
        Update: {
          changed_by?: string | null
          client_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cph_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cph_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cph_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      client_trainer_assignments: {
        Row: {
          assigned_by: string | null
          client_id: string
          created_at: string
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
          started_at: string
          trainer_id: string
        }
        Insert: {
          assigned_by?: string | null
          client_id: string
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          trainer_id: string
        }
        Update: {
          assigned_by?: string | null
          client_id?: string
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cta_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cta_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cta_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cta_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          joined_at: string
          origin: Database["public"]["Enums"]["client_origin"]
          plan_id: string
          referred_by: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id: string
          joined_at?: string
          origin: Database["public"]["Enums"]["client_origin"]
          plan_id: string
          referred_by?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          joined_at?: string
          origin?: Database["public"]["Enums"]["client_origin"]
          plan_id?: string
          referred_by?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_profiles_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_prices: {
        Row: {
          amount_cop: number
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          plan_id: string
        }
        Insert: {
          amount_cop: number
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          plan_id: string
        }
        Update: {
          amount_cop?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_prices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_prices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          frequency: Database["public"]["Enums"]["plan_frequency"]
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          frequency: Database["public"]["Enums"]["plan_frequency"]
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["plan_frequency"]
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          gender: Database["public"]["Enums"]["gender"]
          id: string
          is_active: boolean
          neighborhood: string
          password_change_required: boolean
          phone: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date: string
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          gender: Database["public"]["Enums"]["gender"]
          id: string
          is_active?: boolean
          neighborhood: string
          password_change_required?: boolean
          phone: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          gender?: Database["public"]["Enums"]["gender"]
          id?: string
          is_active?: boolean
          neighborhood?: string
          password_change_required?: boolean
          phone?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_bank_accounts: {
        Row: {
          account_number: string
          account_type: Database["public"]["Enums"]["bank_account_type"]
          bank: Database["public"]["Enums"]["bank"]
          created_at: string
          id: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          account_number: string
          account_type: Database["public"]["Enums"]["bank_account_type"]
          bank: Database["public"]["Enums"]["bank"]
          created_at?: string
          id?: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          account_type?: Database["public"]["Enums"]["bank_account_type"]
          bank?: Database["public"]["Enums"]["bank"]
          created_at?: string
          id?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_bank_accounts_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_details: {
        Row: {
          address: string
          created_at: string
          document_number: string
          document_type: Database["public"]["Enums"]["document_type"]
          id: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          document_number: string
          document_type: Database["public"]["Enums"]["document_type"]
          id: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          document_number?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_details_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_documents: {
        Row: {
          category: Database["public"]["Enums"]["trainer_document_category"]
          created_at: string
          file_path: string
          id: string
          mime_type: string
          original_filename: string
          size_bytes: number
          trainer_id: string
          uploaded_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["trainer_document_category"]
          created_at?: string
          file_path: string
          id?: string
          mime_type?: string
          original_filename: string
          size_bytes: number
          trainer_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["trainer_document_category"]
          created_at?: string
          file_path?: string
          id?: string
          mime_type?: string
          original_filename?: string
          size_bytes?: number
          trainer_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_documents_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_trainer: {
        Args: {
          p_assigned_by: string
          p_client_id: string
          p_notes?: string
          p_trainer_id: string
        }
        Returns: undefined
      }
      auth_role: { Args: never; Returns: string }
      change_client_plan: {
        Args: {
          p_changed_by: string
          p_client_id: string
          p_new_plan_id: string
          p_notes?: string
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_client: { Args: never; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
    }
    Enums: {
      bank: "bancolombia" | "nequi"
      bank_account_type: "ahorros" | "corriente"
      client_origin: "referido" | "publicidad" | "llego_solo"
      client_status: "active" | "inactive" | "suspended" | "overdue"
      document_type: "cc" | "ce" | "ti" | "pa" | "nit"
      gender: "male" | "female" | "other" | "prefer_not_to_say"
      plan_frequency: "three_days" | "six_days"
      trainer_document_category:
        | "contrato"
        | "hoja_de_vida"
        | "eps"
        | "arl"
        | "certificado_bancario"
        | "otro"
      user_role: "admin" | "trainer" | "client"
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
      bank: ["bancolombia", "nequi"],
      bank_account_type: ["ahorros", "corriente"],
      client_origin: ["referido", "publicidad", "llego_solo"],
      client_status: ["active", "inactive", "suspended", "overdue"],
      document_type: ["cc", "ce", "ti", "pa", "nit"],
      gender: ["male", "female", "other", "prefer_not_to_say"],
      plan_frequency: ["three_days", "six_days"],
      trainer_document_category: [
        "contrato",
        "hoja_de_vida",
        "eps",
        "arl",
        "certificado_bancario",
        "otro",
      ],
      user_role: ["admin", "trainer", "client"],
    },
  },
} as const

// ---------------------------------------------------------------------------
// Aliases de conveniencia — usar en lugar de los tipos genéricos de Database
// ---------------------------------------------------------------------------

// profiles
export type UserRole = Database["public"]["Enums"]["user_role"]
export type Gender = Database["public"]["Enums"]["gender"]
export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"]
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"]

// trainer_details
export type DocumentType = Database["public"]["Enums"]["document_type"]
export type TrainerDetails = Database["public"]["Tables"]["trainer_details"]["Row"]
export type TrainerDetailsInsert = Database["public"]["Tables"]["trainer_details"]["Insert"]
export type TrainerDetailsUpdate = Database["public"]["Tables"]["trainer_details"]["Update"]

// trainer_bank_accounts
export type Bank = Database["public"]["Enums"]["bank"]
export type BankAccountType = Database["public"]["Enums"]["bank_account_type"]
export type TrainerBankAccount = Database["public"]["Tables"]["trainer_bank_accounts"]["Row"]
export type TrainerBankAccountInsert = Database["public"]["Tables"]["trainer_bank_accounts"]["Insert"]
export type TrainerBankAccountUpdate = Database["public"]["Tables"]["trainer_bank_accounts"]["Update"]

// trainer_documents
export type TrainerDocumentCategory = Database["public"]["Enums"]["trainer_document_category"]
export type TrainerDocument = Database["public"]["Tables"]["trainer_documents"]["Row"]
export type TrainerDocumentInsert = Database["public"]["Tables"]["trainer_documents"]["Insert"]
export type TrainerDocumentUpdate = Database["public"]["Tables"]["trainer_documents"]["Update"]

// plans
export type PlanFrequency = Database["public"]["Enums"]["plan_frequency"]
export type Plan = Database["public"]["Tables"]["plans"]["Row"]
export type PlanInsert = Database["public"]["Tables"]["plans"]["Insert"]
export type PlanUpdate = Database["public"]["Tables"]["plans"]["Update"]

// plan_prices
export type PlanPrice = Database["public"]["Tables"]["plan_prices"]["Row"]
export type PlanPriceInsert = Database["public"]["Tables"]["plan_prices"]["Insert"]
export type PlanPriceUpdate = Database["public"]["Tables"]["plan_prices"]["Update"]

// clients
export type ClientOrigin = Database["public"]["Enums"]["client_origin"]
export type ClientStatus = Database["public"]["Enums"]["client_status"]
export type Client = Database["public"]["Tables"]["clients"]["Row"]
export type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"]
export type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"]

// client_plan_history
export type ClientPlanHistory = Database["public"]["Tables"]["client_plan_history"]["Row"]
export type ClientPlanHistoryInsert = Database["public"]["Tables"]["client_plan_history"]["Insert"]
export type ClientPlanHistoryUpdate = Database["public"]["Tables"]["client_plan_history"]["Update"]

// client_trainer_assignments
export type ClientTrainerAssignment = Database["public"]["Tables"]["client_trainer_assignments"]["Row"]
export type ClientTrainerAssignmentInsert = Database["public"]["Tables"]["client_trainer_assignments"]["Insert"]
export type ClientTrainerAssignmentUpdate = Database["public"]["Tables"]["client_trainer_assignments"]["Update"]

// client_body_measurements
export type ClientBodyMeasurement = Database["public"]["Tables"]["client_body_measurements"]["Row"]
export type ClientBodyMeasurementInsert = Database["public"]["Tables"]["client_body_measurements"]["Insert"]
export type ClientBodyMeasurementUpdate = Database["public"]["Tables"]["client_body_measurements"]["Update"]
