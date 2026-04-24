// Generado automáticamente con `mcp supabase generate_typescript_types`.
// Refleja el estado de la base tras el Hito 1 (auth foundation).
// NO editar a mano. Regenerar cuando el esquema cambie.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null;
          birth_date: string;
          created_at: string;
          created_by: string | null;
          email: string;
          full_name: string;
          gender: Database['public']['Enums']['gender'];
          id: string;
          is_active: boolean;
          neighborhood: string;
          password_change_required: boolean;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
          whatsapp: string;
        };
        Insert: {
          avatar_url?: string | null;
          birth_date: string;
          created_at?: string;
          created_by?: string | null;
          email: string;
          full_name: string;
          gender: Database['public']['Enums']['gender'];
          id: string;
          is_active?: boolean;
          neighborhood: string;
          password_change_required?: boolean;
          role: Database['public']['Enums']['user_role'];
          updated_at?: string;
          whatsapp: string;
        };
        Update: {
          avatar_url?: string | null;
          birth_date?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          full_name?: string;
          gender?: Database['public']['Enums']['gender'];
          id?: string;
          is_active?: boolean;
          neighborhood?: string;
          password_change_required?: boolean;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
          whatsapp?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      auth_role: { Args: never; Returns: string };
      is_admin: { Args: never; Returns: boolean };
      is_client: { Args: never; Returns: boolean };
      is_trainer: { Args: never; Returns: boolean };
    };
    Enums: {
      gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
      user_role: 'admin' | 'trainer' | 'client';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type UserRole = Database['public']['Enums']['user_role'];
export type Gender = Database['public']['Enums']['gender'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
