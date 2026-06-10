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
      app_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_measurements: {
        Row: {
          abdomen_cm: number | null
          arm_left_cm: number | null
          arm_right_cm: number | null
          body_fat_pct: number | null
          calf_left_cm: number | null
          calf_right_cm: number | null
          chest_cm: number | null
          client_id: string
          created_at: string
          hip_cm: number | null
          id: string
          measured_at: string
          notes: string | null
          registered_by: string | null
          skinfold_abdomen_mm: number | null
          skinfold_axilla_mm: number | null
          skinfold_biceps_mm: number | null
          skinfold_calf_mm: number | null
          skinfold_chest_mm: number | null
          skinfold_subscapular_mm: number | null
          skinfold_suprailiac_mm: number | null
          skinfold_thigh_mm: number | null
          skinfold_triceps_mm: number | null
          thigh_left_cm: number | null
          thigh_right_cm: number | null
          weight_kg: number
        }
        Insert: {
          abdomen_cm?: number | null
          arm_left_cm?: number | null
          arm_right_cm?: number | null
          body_fat_pct?: number | null
          calf_left_cm?: number | null
          calf_right_cm?: number | null
          chest_cm?: number | null
          client_id: string
          created_at?: string
          hip_cm?: number | null
          id?: string
          measured_at: string
          notes?: string | null
          registered_by?: string | null
          skinfold_abdomen_mm?: number | null
          skinfold_axilla_mm?: number | null
          skinfold_biceps_mm?: number | null
          skinfold_calf_mm?: number | null
          skinfold_chest_mm?: number | null
          skinfold_subscapular_mm?: number | null
          skinfold_suprailiac_mm?: number | null
          skinfold_thigh_mm?: number | null
          skinfold_triceps_mm?: number | null
          thigh_left_cm?: number | null
          thigh_right_cm?: number | null
          weight_kg: number
        }
        Update: {
          abdomen_cm?: number | null
          arm_left_cm?: number | null
          arm_right_cm?: number | null
          body_fat_pct?: number | null
          calf_left_cm?: number | null
          calf_right_cm?: number | null
          chest_cm?: number | null
          client_id?: string
          created_at?: string
          hip_cm?: number | null
          id?: string
          measured_at?: string
          notes?: string | null
          registered_by?: string | null
          skinfold_abdomen_mm?: number | null
          skinfold_axilla_mm?: number | null
          skinfold_biceps_mm?: number | null
          skinfold_calf_mm?: number | null
          skinfold_chest_mm?: number | null
          skinfold_subscapular_mm?: number | null
          skinfold_suprailiac_mm?: number | null
          skinfold_thigh_mm?: number | null
          skinfold_triceps_mm?: number | null
          thigh_left_cm?: number | null
          thigh_right_cm?: number | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "cm_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_clients_with_payment_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_registered_by_fkey"
            columns: ["registered_by"]
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
            foreignKeyName: "cph_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_clients_with_payment_status"
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
            foreignKeyName: "cta_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_clients_with_payment_status"
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
      client_weight_logs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          measured_at: string
          notes: string | null
          registered_by: string | null
          updated_at: string
          weight_kg: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          measured_at: string
          notes?: string | null
          registered_by?: string | null
          updated_at?: string
          weight_kg: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          measured_at?: string
          notes?: string | null
          registered_by?: string | null
          updated_at?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "cwl_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cwl_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_clients_with_payment_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cwl_registered_by_fkey"
            columns: ["registered_by"]
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
          height_cm: number | null
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
          height_cm?: number | null
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
          height_cm?: number | null
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
      closure_adjustments: {
        Row: {
          amount_cop: number
          closure_id: string
          created_at: string
          created_by: string
          id: string
          reason: string
        }
        Insert: {
          amount_cop: number
          closure_id: string
          created_at?: string
          created_by: string
          id?: string
          reason: string
        }
        Update: {
          amount_cop?: number
          closure_id?: string
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "closure_adjustments_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "trainer_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      closure_client_entries: {
        Row: {
          client_id: string
          client_name: string
          closure_id: string
          created_at: string
          cumulative_equivalente: number
          equivalente: number
          id: string
          payment_id: string
          payment_order: number
          plan_frequency_snapshot: Database["public"]["Enums"]["plan_frequency"]
          reception_date: string
        }
        Insert: {
          client_id: string
          client_name: string
          closure_id: string
          created_at?: string
          cumulative_equivalente: number
          equivalente: number
          id?: string
          payment_id: string
          payment_order: number
          plan_frequency_snapshot: Database["public"]["Enums"]["plan_frequency"]
          reception_date: string
        }
        Update: {
          client_id?: string
          client_name?: string
          closure_id?: string
          created_at?: string
          cumulative_equivalente?: number
          equivalente?: number
          id?: string
          payment_id?: string
          payment_order?: number
          plan_frequency_snapshot?: Database["public"]["Enums"]["plan_frequency"]
          reception_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "closure_client_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_client_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_clients_with_payment_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_client_entries_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "trainer_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_client_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          amount_cop: number | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          percentage: number | null
          type: Database["public"]["Enums"]["discount_type"]
          updated_at: string
          value_type: Database["public"]["Enums"]["discount_value_type"]
        }
        Insert: {
          amount_cop?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          percentage?: number | null
          type: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          value_type: Database["public"]["Enums"]["discount_value_type"]
        }
        Update: {
          amount_cop?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          percentage?: number | null
          type?: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          value_type?: Database["public"]["Enums"]["discount_value_type"]
        }
        Relationships: [
          {
            foreignKeyName: "discounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expense_type: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_type?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_type?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_record_items: {
        Row: {
          created_at: string
          description: string | null
          expense_record_id: string
          id: string
          name: string
          quantity: number
          subtotal_cop: number
          unit_price_cop: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          expense_record_id: string
          id?: string
          name: string
          quantity?: number
          subtotal_cop: number
          unit_price_cop: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          expense_record_id?: string
          id?: string
          name?: string
          quantity?: number
          subtotal_cop?: number
          unit_price_cop?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_record_items_expense_record_id_fkey"
            columns: ["expense_record_id"]
            isOneToOne: false
            referencedRelation: "expense_records"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_records: {
        Row: {
          amount_cop: number
          category_id: string
          created_at: string
          created_by: string
          expense_date: string
          id: string
          invoice_mime_type: string | null
          invoice_size_bytes: number | null
          invoice_storage_path: string | null
          is_active: boolean
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          provider_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_cop: number
          category_id: string
          created_at?: string
          created_by: string
          expense_date: string
          id?: string
          invoice_mime_type?: string | null
          invoice_size_bytes?: number | null
          invoice_storage_path?: string | null
          is_active?: boolean
          notes?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          provider_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_cop?: number
          category_id?: string
          created_at?: string
          created_by?: string
          expense_date?: string
          id?: string
          invoice_mime_type?: string | null
          invoice_size_bytes?: number | null
          invoice_storage_path?: string | null
          is_active?: boolean
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          provider_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_records_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_records_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_payments: {
        Row: {
          amount_cop: number
          created_at: string
          created_by: string
          id: string
          loan_id: string
          notes: string | null
          payment_date: string
          payment_method: string
        }
        Insert: {
          amount_cop: number
          created_at?: string
          created_by: string
          id?: string
          loan_id: string
          notes?: string | null
          payment_date?: string
          payment_method: string
        }
        Update: {
          amount_cop?: number
          created_at?: string
          created_by?: string
          id?: string
          loan_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount_cop: number
          beneficiary_type: string
          closed_at: string | null
          closed_by: string | null
          closure_type: string | null
          created_at: string
          created_by: string
          id: string
          loan_date: string
          loss_cop: number | null
          notes: string | null
          profit_cop: number | null
          provider_id: string | null
          status: string
          third_party_name: string | null
          total_paid_cop: number
          trainer_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_cop: number
          beneficiary_type: string
          closed_at?: string | null
          closed_by?: string | null
          closure_type?: string | null
          created_at?: string
          created_by: string
          id?: string
          loan_date?: string
          loss_cop?: number | null
          notes?: string | null
          profit_cop?: number | null
          provider_id?: string | null
          status?: string
          third_party_name?: string | null
          total_paid_cop?: number
          trainer_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_cop?: number
          beneficiary_type?: string
          closed_at?: string | null
          closed_by?: string | null
          closure_type?: string | null
          created_at?: string
          created_by?: string
          id?: string
          loan_date?: string
          loss_cop?: number | null
          notes?: string | null
          profit_cop?: number | null
          provider_id?: string | null
          status?: string
          third_party_name?: string | null
          total_paid_cop?: number
          trainer_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_installments: {
        Row: {
          amount_cop: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reception_date: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_cop: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reception_date: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_cop?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reception_date?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_installments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_received_cop: number
          balance_cop: number
          client_id: string
          created_at: string
          created_by: string | null
          discount_amount_cop: number
          discount_id: string | null
          discount_percentage_applied: number | null
          discount_type_applied:
            | Database["public"]["Enums"]["discount_type"]
            | null
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          plan_price_id: string
          plan_total_cop: number
          receipt_email_id: string | null
          receipt_last_error: string | null
          receipt_send_attempts: number
          receipt_sent_at: string | null
          reception_date: string
          reported_date: string
          status: Database["public"]["Enums"]["payment_status"]
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_received_cop?: number
          balance_cop: number
          client_id: string
          created_at?: string
          created_by?: string | null
          discount_amount_cop?: number
          discount_id?: string | null
          discount_percentage_applied?: number | null
          discount_type_applied?:
            | Database["public"]["Enums"]["discount_type"]
            | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          plan_price_id: string
          plan_total_cop: number
          receipt_email_id?: string | null
          receipt_last_error?: string | null
          receipt_send_attempts?: number
          receipt_sent_at?: string | null
          reception_date: string
          reported_date: string
          status?: Database["public"]["Enums"]["payment_status"]
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_received_cop?: number
          balance_cop?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          discount_amount_cop?: number
          discount_id?: string | null
          discount_percentage_applied?: number | null
          discount_type_applied?:
            | Database["public"]["Enums"]["discount_type"]
            | null
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_end?: string
          period_start?: string
          plan_price_id?: string
          plan_total_cop?: number
          receipt_email_id?: string | null
          receipt_last_error?: string | null
          receipt_send_attempts?: number
          receipt_sent_at?: string | null
          reception_date?: string
          reported_date?: string
          status?: Database["public"]["Enums"]["payment_status"]
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_clients_with_payment_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_price_id_fkey"
            columns: ["plan_price_id"]
            isOneToOne: false
            referencedRelation: "plan_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
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
      provider_bank_accounts: {
        Row: {
          account_holder_name: string | null
          account_number: string
          account_type: Database["public"]["Enums"]["bank_account_type"]
          bank: Database["public"]["Enums"]["bank"]
          created_at: string
          id: string
          is_primary: boolean
          provider_id: string
          updated_at: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number: string
          account_type: Database["public"]["Enums"]["bank_account_type"]
          bank: Database["public"]["Enums"]["bank"]
          created_at?: string
          id?: string
          is_primary?: boolean
          provider_id: string
          updated_at?: string
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string
          account_type?: Database["public"]["Enums"]["bank_account_type"]
          bank?: Database["public"]["Enums"]["bank"]
          created_at?: string
          id?: string
          is_primary?: boolean
          provider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_bank_accounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_providers: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          document_number: string
          document_type: Database["public"]["Enums"]["document_type"]
          email: string | null
          entity_type: Database["public"]["Enums"]["provider_entity_type"]
          id: string
          name: string
          phone: string | null
          service_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          document_number: string
          document_type: Database["public"]["Enums"]["document_type"]
          email?: string | null
          entity_type: Database["public"]["Enums"]["provider_entity_type"]
          id?: string
          name: string
          phone?: string | null
          service_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          document_number?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          email?: string | null
          entity_type?: Database["public"]["Enums"]["provider_entity_type"]
          id?: string
          name?: string
          phone?: string | null
          service_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_providers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_providers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_providers_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_types_created_by_fkey"
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
      trainer_closures: {
        Row: {
          adjustments_total_cop: number
          base_cop: number
          bonus_q_cop: number
          closed_at: string
          closed_by: string
          count_six_days: number
          count_three_days: number
          created_at: string
          equivalente_mes_acum_at_close: number
          equivalente_q: number
          id: string
          month: number
          paid_at: string | null
          paid_by: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_notes: string | null
          personal_discounts_total_cop: number
          quincena: Database["public"]["Enums"]["closure_quincena"]
          reopened_at: string | null
          reopened_by: string | null
          status: Database["public"]["Enums"]["closure_status"]
          total_cop: number
          trainer_id: string
          updated_at: string
          year: number
        }
        Insert: {
          adjustments_total_cop?: number
          base_cop?: number
          bonus_q_cop?: number
          closed_at: string
          closed_by: string
          count_six_days?: number
          count_three_days?: number
          created_at?: string
          equivalente_mes_acum_at_close?: number
          equivalente_q?: number
          id?: string
          month: number
          paid_at?: string | null
          paid_by?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_notes?: string | null
          personal_discounts_total_cop?: number
          quincena: Database["public"]["Enums"]["closure_quincena"]
          reopened_at?: string | null
          reopened_by?: string | null
          status: Database["public"]["Enums"]["closure_status"]
          total_cop: number
          trainer_id: string
          updated_at?: string
          year: number
        }
        Update: {
          adjustments_total_cop?: number
          base_cop?: number
          bonus_q_cop?: number
          closed_at?: string
          closed_by?: string
          count_six_days?: number
          count_three_days?: number
          created_at?: string
          equivalente_mes_acum_at_close?: number
          equivalente_q?: number
          id?: string
          month?: number
          paid_at?: string | null
          paid_by?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_notes?: string | null
          personal_discounts_total_cop?: number
          quincena?: Database["public"]["Enums"]["closure_quincena"]
          reopened_at?: string | null
          reopened_by?: string | null
          status?: Database["public"]["Enums"]["closure_status"]
          total_cop?: number
          trainer_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "trainer_closures_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_closures_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_closures_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_closures_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
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
      weight_logs: {
        Row: {
          client_id: string
          created_at: string
          id: string
          measured_at: string
          registered_by: string | null
          updated_at: string
          weight_kg: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          measured_at: string
          registered_by?: string | null
          updated_at?: string
          weight_kg: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          measured_at?: string
          registered_by?: string | null
          updated_at?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "weight_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "v_clients_with_payment_status"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_clients_with_payment_status: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          joined_at: string | null
          last_event_amount_cop: number | null
          last_event_date: string | null
          last_payment_balance_cop: number | null
          last_payment_period_end: string | null
          last_payment_status: string | null
          membership_status: string | null
          origin: Database["public"]["Enums"]["client_origin"] | null
          phone: string | null
          plan_amount_cop: number | null
          plan_id: string | null
          plan_name: string | null
          referred_by: string | null
          referred_by_name: string | null
          status: Database["public"]["Enums"]["client_status"] | null
          trainer_name: string | null
          updated_at: string | null
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
      calculate_period_end: {
        Args: { p_period_start: string }
        Returns: string
      }
      change_client_plan: {
        Args: {
          p_changed_by: string
          p_client_id: string
          p_new_plan_id: string
          p_notes?: string
        }
        Returns: undefined
      }
      claim_receipt_send: {
        Args: { p_force_resend?: boolean; p_payment_id: string }
        Returns: Json
      }
      compute_personal_discounts_for_closure: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_trainer_id: string
        }
        Returns: number
      }
      compute_trainer_month_payments: {
        Args: {
          p_month_end: string
          p_month_start: string
          p_trainer_id: string
        }
        Returns: {
          client_id: string
          client_name: string
          created_at: string
          payment_id: string
          plan_frequency: string
          reception_date: string
        }[]
      }
      execute_register_installment: {
        Args: {
          p_amount_cop: number
          p_created_by: string
          p_notes: string
          p_payment_id: string
          p_payment_method: string
          p_reception_date: string
        }
        Returns: Json
      }
      execute_void_payment: {
        Args: { p_notes: string; p_payment_id: string; p_voided_by: string }
        Returns: Json
      }
      fn_stats_clients_cards: {
        Args: { p_ref: string; p_te: string }
        Returns: {
          parciales_mes: number
          ta_3d: number
          ta_6d: number
          ta_prev_total: number
          ta_total: number
          tah_3d: number
          tah_6d: number
          tah_prev_total: number
          tah_total: number
          tb_3d: number
          tb_6d: number
          tb_prev_total: number
          tb_total: number
          total_sistema: number
        }[]
      }
      fn_stats_clients_detalle: {
        Args: { p_ref: string; p_te: string }
        Returns: {
          en_riesgo: Json
          nuevos_3d: number
          nuevos_6d: number
          nuevos_llego_solo_3d: number
          nuevos_llego_solo_6d: number
          nuevos_llego_solo_prev_total: number
          nuevos_llego_solo_total: number
          nuevos_prev_total: number
          nuevos_publicidad_3d: number
          nuevos_publicidad_6d: number
          nuevos_publicidad_prev_total: number
          nuevos_publicidad_total: number
          nuevos_referido_3d: number
          nuevos_referido_6d: number
          nuevos_referido_prev_total: number
          nuevos_referido_total: number
          nuevos_total: number
          recuperados_3d: number
          recuperados_6d: number
          recuperados_prev_total: number
          recuperados_total: number
          retencion_activos_prev: number
          retencion_repitieron: number
        }[]
      }
      fn_stats_clients_quincenal: {
        Args: { p_ref: string; p_te: string }
        Returns: {
          pen_3d: number
          pen_6d: number
          pen_total: number
          per_3d: number
          per_6d: number
          per_prev_total: number
          per_total: number
          q1_3d: number
          q1_6d: number
          q1_prev_total: number
          q1_total: number
          q2_3d: number
          q2_6d: number
          q2_prev_total: number
          q2_total: number
        }[]
      }
      fn_stats_clients_quincenal_tendencia: {
        Args: { p_meses_atras: number; p_ref: string; p_te: string }
        Returns: {
          cut_date: string
          is_current: boolean
          mes: string
          q1_3d: number
          q1_6d: number
          q1_total: number
          q2_3d: number
          q2_6d: number
          q2_total: number
        }[]
      }
      fn_stats_clients_tendencia: {
        Args: { p_meses_atras: number; p_ref: string; p_te: string }
        Returns: {
          cut_date: string
          is_current: boolean
          mes: string
          plan_3d: number
          plan_6d: number
          total: number
        }[]
      }
      get_client_last_field_values: {
        Args: { p_client_id: string }
        Returns: Json
      }
      get_client_last_weight_log: {
        Args: { p_client_id: string }
        Returns: {
          measured_at: string
          weight_kg: number
        }[]
      }
      get_expense_summary_by_category: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          category_emoji: string
          category_id: string
          category_name: string
          record_count: number
          total_cop: number
        }[]
      }
      get_expense_summary_by_provider: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          provider_id: string
          provider_name: string
          record_count: number
          service_type_name: string
          total_cop: number
        }[]
      }
      get_max_allowed_period_start: { Args: never; Returns: string }
      get_trainers_quincena_counts: {
        Args: never
        Returns: {
          plan_code: string
          q1_count: number
          q2_count: number
          trainer_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_client: { Args: never; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
      stats_finanzas_caja_al_corte: {
        Args: { p_corte: string }
        Returns: number
      }
      stats_finanzas_caja_menor: {
        Args: { p_hoy: string; p_inicio: string }
        Returns: {
          cantidad_pagos: number
          total: number
        }[]
      }
      stats_finanzas_composicion: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      stats_finanzas_detalle: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      stats_finanzas_egresos_operativos: {
        Args: never
        Returns: {
          total: number
        }[]
      }
      stats_finanzas_ingresos_consolidados: {
        Args: never
        Returns: {
          total: number
        }[]
      }
      stats_finanzas_month_metrics: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          egresos_operativos_cop: number
          ingresos_cop: number
          nomina_cop: number
        }[]
      }
      stats_finanzas_nomina_pagada: {
        Args: never
        Returns: {
          total: number
        }[]
      }
      stats_finanzas_resumen: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      stats_finanzas_sparklines: { Args: never; Returns: Json }
      stats_finanzas_tendencia: {
        Args: { p_meses_atras: number }
        Returns: Json
      }
    }
    Enums: {
      bank:
        | "bancolombia"
        | "nequi"
        | "davivienda"
        | "banco_de_bogota"
        | "bbva"
        | "banco_popular"
        | "banco_caja_social"
        | "colpatria"
        | "itau"
        | "scotiabank"
        | "otro"
      bank_account_type: "ahorros" | "corriente"
      client_origin: "referido" | "publicidad" | "llego_solo"
      client_status: "active" | "inactive" | "suspended" | "overdue"
      closure_quincena: "q1" | "q2"
      closure_status: "open" | "closed" | "paid"
      discount_type: "promocion" | "personal"
      discount_value_type: "percentage" | "fixed"
      document_type: "cc" | "ce" | "ti" | "pa" | "nit"
      gender: "male" | "female"
      payment_method: "cash" | "transfer" | "nequi" | "other"
      payment_status: "pending" | "partial" | "paid" | "voided"
      plan_frequency: "three_days" | "six_days"
      provider_entity_type: "persona" | "empresa"
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
      bank: [
        "bancolombia",
        "nequi",
        "davivienda",
        "banco_de_bogota",
        "bbva",
        "banco_popular",
        "banco_caja_social",
        "colpatria",
        "itau",
        "scotiabank",
        "otro",
      ],
      bank_account_type: ["ahorros", "corriente"],
      client_origin: ["referido", "publicidad", "llego_solo"],
      client_status: ["active", "inactive", "suspended", "overdue"],
      closure_quincena: ["q1", "q2"],
      closure_status: ["open", "closed", "paid"],
      discount_type: ["promocion", "personal"],
      discount_value_type: ["percentage", "fixed"],
      document_type: ["cc", "ce", "ti", "pa", "nit"],
      gender: ["male", "female"],
      payment_method: ["cash", "transfer", "nequi", "other"],
      payment_status: ["pending", "partial", "paid", "voided"],
      plan_frequency: ["three_days", "six_days"],
      provider_entity_type: ["persona", "empresa"],
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

// client_measurements
export type ClientMeasurement = Database["public"]["Tables"]["client_measurements"]["Row"]
export type ClientMeasurementInsert = Database["public"]["Tables"]["client_measurements"]["Insert"]
export type ClientMeasurementUpdate = Database["public"]["Tables"]["client_measurements"]["Update"]

// client_weight_logs
export type ClientWeightLog       = Database["public"]["Tables"]["client_weight_logs"]["Row"]
export type ClientWeightLogInsert = Database["public"]["Tables"]["client_weight_logs"]["Insert"]
export type ClientWeightLogUpdate = Database["public"]["Tables"]["client_weight_logs"]["Update"]

// payments
export type PaymentStatus = Database["public"]["Enums"]["payment_status"]
export type PaymentMethod = Database["public"]["Enums"]["payment_method"]
export type Payment = Database["public"]["Tables"]["payments"]["Row"]
export type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"]
export type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"]

// payment_installments
export type PaymentInstallment = Database["public"]["Tables"]["payment_installments"]["Row"]
export type PaymentInstallmentInsert = Database["public"]["Tables"]["payment_installments"]["Insert"]
export type PaymentInstallmentUpdate = Database["public"]["Tables"]["payment_installments"]["Update"]

// discounts
export type Discount = Database["public"]["Tables"]["discounts"]["Row"]
export type DiscountInsert = Database["public"]["Tables"]["discounts"]["Insert"]
export type DiscountUpdate = Database["public"]["Tables"]["discounts"]["Update"]
export type DiscountType = Database["public"]["Enums"]["discount_type"]
export type DiscountValueType = Database["public"]["Enums"]["discount_value_type"]

// v_clients_with_payment_status
export type ClientWithPaymentStatus = Database["public"]["Views"]["v_clients_with_payment_status"]["Row"]

// service_types
export type ServiceType = Database["public"]["Tables"]["service_types"]["Row"]
export type ServiceTypeInsert = Database["public"]["Tables"]["service_types"]["Insert"]
export type ServiceTypeUpdate = Database["public"]["Tables"]["service_types"]["Update"]

// service_providers
export type ProviderEntityType = Database["public"]["Enums"]["provider_entity_type"]
export type ServiceProvider = Database["public"]["Tables"]["service_providers"]["Row"]
export type ServiceProviderInsert = Database["public"]["Tables"]["service_providers"]["Insert"]
export type ServiceProviderUpdate = Database["public"]["Tables"]["service_providers"]["Update"]

// provider_bank_accounts
export type ProviderBankAccount = Database["public"]["Tables"]["provider_bank_accounts"]["Row"]
export type ProviderBankAccountInsert = Database["public"]["Tables"]["provider_bank_accounts"]["Insert"]
export type ProviderBankAccountUpdate = Database["public"]["Tables"]["provider_bank_accounts"]["Update"]

// trainer_closures
export type ClosureStatus = Database["public"]["Enums"]["closure_status"]
export type ClosureQuincena = Database["public"]["Enums"]["closure_quincena"]
export type TrainerClosure = Database["public"]["Tables"]["trainer_closures"]["Row"]
export type TrainerClosureInsert = Database["public"]["Tables"]["trainer_closures"]["Insert"]
export type TrainerClosureUpdate = Database["public"]["Tables"]["trainer_closures"]["Update"]

// closure_client_entries
export type ClosureClientEntry = Database["public"]["Tables"]["closure_client_entries"]["Row"]
export type ClosureClientEntryInsert = Database["public"]["Tables"]["closure_client_entries"]["Insert"]

// closure_adjustments
export type ClosureAdjustment = Database["public"]["Tables"]["closure_adjustments"]["Row"]
export type ClosureAdjustmentInsert = Database["public"]["Tables"]["closure_adjustments"]["Insert"]

// expense_categories
export type ExpenseCategory = Database["public"]["Tables"]["expense_categories"]["Row"]
export type ExpenseCategoryInsert = Database["public"]["Tables"]["expense_categories"]["Insert"]
export type ExpenseCategoryUpdate = Database["public"]["Tables"]["expense_categories"]["Update"]

// expense_records
export type ExpenseRecord = Database["public"]["Tables"]["expense_records"]["Row"]
export type ExpenseRecordInsert = Database["public"]["Tables"]["expense_records"]["Insert"]
export type ExpenseRecordUpdate = Database["public"]["Tables"]["expense_records"]["Update"]

// expense_record_items
export type ExpenseRecordItem = Database["public"]["Tables"]["expense_record_items"]["Row"]
export type ExpenseRecordItemInsert = Database["public"]["Tables"]["expense_record_items"]["Insert"]
export type ExpenseRecordItemUpdate = Database["public"]["Tables"]["expense_record_items"]["Update"]

// app_config
export type AppConfig = Database["public"]["Tables"]["app_config"]["Row"]
export type AppConfigInsert = Database["public"]["Tables"]["app_config"]["Insert"]
export type AppConfigUpdate = Database["public"]["Tables"]["app_config"]["Update"]

// loans
export type Loan = Database["public"]["Tables"]["loans"]["Row"]
export type LoanInsert = Database["public"]["Tables"]["loans"]["Insert"]
export type LoanUpdate = Database["public"]["Tables"]["loans"]["Update"]

// loan_payments
export type LoanPayment = Database["public"]["Tables"]["loan_payments"]["Row"]
export type LoanPaymentInsert = Database["public"]["Tables"]["loan_payments"]["Insert"]
