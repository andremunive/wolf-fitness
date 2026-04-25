// Generado con mcp supabase generate_typescript_types.
// Refleja el estado de la base tras el Hito 2 (trainer module).
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
      auth_role: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_client: { Args: never; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
    }
    Enums: {
      bank: "bancolombia" | "nequi"
      bank_account_type: "ahorros" | "corriente"
      document_type: "cc" | "ce" | "ti" | "pa" | "nit"
      gender: "male" | "female" | "other" | "prefer_not_to_say"
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
      document_type: ["cc", "ce", "ti", "pa", "nit"],
      gender: ["male", "female", "other", "prefer_not_to_say"],
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
