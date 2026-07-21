import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          school_id: string | null;
          role: string;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          school_id?: string | null;
          role?: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string | null;
          role?: string;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      students: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          year_group: string;
          form: string;
          send_status: string | null;
          pupil_premium: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          name: string;
          year_group: string;
          form: string;
          send_status?: string | null;
          pupil_premium?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          name?: string;
          year_group?: string;
          form?: string;
          send_status?: string | null;
          pupil_premium?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      uploads: {
        Row: {
          id: string;
          school_id: string;
          uploaded_by: string;
          filename: string;
          row_count: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          uploaded_by: string;
          filename: string;
          row_count: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          uploaded_by?: string;
          filename?: string;
          row_count?: number;
          status?: string;
          created_at?: string;
        };
      };
      behaviour_records: {
        Row: {
          id: string;
          student_id: string;
          school_id: string;
          date: string;
          incident_type: string;
          behaviour_points: number;
          lesson_period: string | null;
          subject: string | null;
          staff_member: string | null;
          comment: string | null;
          safeguarding_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          school_id: string;
          date: string;
          incident_type: string;
          behaviour_points?: number;
          lesson_period?: string | null;
          subject?: string | null;
          staff_member?: string | null;
          comment?: string | null;
          safeguarding_note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          school_id?: string;
          date?: string;
          incident_type?: string;
          behaviour_points?: number;
          lesson_period?: string | null;
          subject?: string | null;
          staff_member?: string | null;
          comment?: string | null;
          safeguarding_note?: string | null;
          created_at?: string;
        };
      };
      analysis_results: {
        Row: {
          id: string;
          student_id: string;
          school_id: string;
          risk_level: string;
          key_reasons: Json;
          behaviour_trend: string;
          attendance_trend: string;
          subjects_involved: Json;
          periods_involved: Json;
          suggested_pastoral_action: string | null;
          suggested_parent_contact: string | null;
          suggested_staff_action: string | null;
          career_signposting: string | null;
          recommended_review_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          school_id: string;
          risk_level: string;
          key_reasons?: Json;
          behaviour_trend?: string;
          attendance_trend?: string;
          subjects_involved?: Json;
          periods_involved?: Json;
          suggested_pastoral_action?: string | null;
          suggested_parent_contact?: string | null;
          suggested_staff_action?: string | null;
          career_signposting?: string | null;
          recommended_review_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          school_id?: string;
          risk_level?: string;
          key_reasons?: Json;
          behaviour_trend?: string;
          attendance_trend?: string;
          subjects_involved?: Json;
          periods_involved?: Json;
          suggested_pastoral_action?: string | null;
          suggested_parent_contact?: string | null;
          suggested_staff_action?: string | null;
          career_signposting?: string | null;
          recommended_review_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      interventions: {
        Row: {
          id: string;
          student_id: string;
          school_id: string;
          assigned_to: string;
          action_type: string;
          priority: string;
          status: string;
          due_date: string | null;
          notes: string | null;
          outcome: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          school_id: string;
          assigned_to: string;
          action_type: string;
          priority?: string;
          status?: string;
          due_date?: string | null;
          notes?: string | null;
          outcome?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          school_id?: string;
          assigned_to?: string;
          action_type?: string;
          priority?: string;
          status?: string;
          due_date?: string | null;
          notes?: string | null;
          outcome?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      career_profiles: {
        Row: {
          id: string;
          student_id: string;
          school_id: string;
          career_interests: Json;
          preferred_subjects: Json;
          strengths: string | null;
          barriers: string | null;
          confidence_level: string | null;
          destination_risk: string | null;
          suggested_pathways: Json;
          useful_signposting: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          school_id: string;
          career_interests?: Json;
          preferred_subjects?: Json;
          strengths?: string | null;
          barriers?: string | null;
          confidence_level?: string | null;
          destination_risk?: string | null;
          suggested_pathways?: Json;
          useful_signposting?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          school_id?: string;
          career_interests?: Json;
          preferred_subjects?: Json;
          strengths?: string | null;
          barriers?: string | null;
          confidence_level?: string | null;
          destination_risk?: string | null;
          suggested_pathways?: Json;
          useful_signposting?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      reports: {
        Row: {
          id: string;
          school_id: string;
          generated_by: string;
          title: string;
          content: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          generated_by: string;
          title: string;
          content?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          generated_by?: string;
          title?: string;
          content?: Json;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

