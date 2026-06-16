export type JobStage =
  | "lead"
  | "proposal_sent"
  | "contract_signed"
  | "in_progress"
  | "in_install"
  | "finished"
  | "cancelled";

export type DocumentType = "contract" | "invoice" | "change_order" | "quote";
export type DocumentStatus = "draft" | "sent" | "signed" | "paid" | "void";
export type CommissionStatus = "pending" | "paid";

export interface CabinetLine {
  id: string;
  name: string;
  description: string | null;
  multiplier: number;
  is_base: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PricingItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  unit_price: number;
  applies_to_cabinet_lines: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  stage: JobStage;
  job_address: string | null;
  start_date: string | null;
  estimated_end_date: string | null;
  actual_end_date: string | null;
  estimated_value: number | null;
  contract_amount: number | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialOrder {
  id: string;
  job_id: string;
  vendor: string;
  description: string | null;
  ordered_at: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobAttachment {
  id: string;
  job_id: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  template_type: string;
  storage_path: string;
  file_name: string;
  notes: string | null;
  created_at: string;
}

export interface Document {
  id: string;
  job_id: string;
  document_type: DocumentType;
  status: DocumentStatus;
  document_number: string;
  title: string;
  notes: string | null;
  client_notes: string | null;
  tax_rate: number;
  discount_amount: number;
  deposit_amount: number;
  due_date: string | null;
  sent_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
  pdf_storage_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentLineItem {
  id: string;
  document_id: string;
  pricing_item_id: string | null;
  sort_order: number;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  created_at: string;
}

export interface JobNote {
  id: string;
  job_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface JobPhoto {
  id: string;
  job_id: string;
  storage_path: string;
  caption: string | null;
  phase: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Communication {
  id: string;
  customer_id: string;
  job_id: string | null;
  channel: string;
  direction: string;
  summary: string;
  occurred_at: string;
  created_at: string;
}

export interface Payment {
  id: string;
  document_id: string;
  job_id: string;
  amount: number;
  payment_date: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface DesignerCommission {
  id: string;
  job_id: string | null;
  invoice_storage_path: string;
  amount: number | null;
  status: CommissionStatus;
  submitted_at: string;
  paid_at: string | null;
  paid_amount: number | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id: string;
  company_name: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_logo_path: string | null;
  payment_terms: string | null;
  default_tax_rate: number;
  updated_at: string;
}

// Full Supabase-compatible Database type
export type Database = {
  public: {
    Tables: {
      cabinet_lines: {
        Row: CabinetLine;
        Insert: { name: string; description?: string | null; multiplier?: number; is_base?: boolean; is_active?: boolean; sort_order?: number; id?: string; created_at?: string; updated_at?: string };
        Update: { name?: string; description?: string | null; multiplier?: number; is_base?: boolean; is_active?: boolean; sort_order?: number; updated_at?: string };
        Relationships: [];
      };
      pricing_items: {
        Row: PricingItem;
        Insert: { name: string; category: string; unit?: string; unit_price: number; description?: string | null; applies_to_cabinet_lines?: boolean; is_active?: boolean; id?: string; created_at?: string; updated_at?: string };
        Update: { name?: string; category?: string; unit?: string; unit_price?: number; description?: string | null; applies_to_cabinet_lines?: boolean; is_active?: boolean; updated_at?: string };
        Relationships: [];
      };
      customers: {
        Row: Customer;
        Insert: { first_name: string; last_name: string; email?: string | null; phone?: string | null; address_line1?: string | null; address_line2?: string | null; city?: string | null; state?: string | null; zip?: string | null; notes?: string | null; id?: string; created_at?: string; updated_at?: string };
        Update: { first_name?: string; last_name?: string; email?: string | null; phone?: string | null; address_line1?: string | null; address_line2?: string | null; city?: string | null; state?: string | null; zip?: string | null; notes?: string | null; updated_at?: string };
        Relationships: [];
      };
      jobs: {
        Row: Job;
        Insert: { customer_id: string; title: string; description?: string | null; stage?: JobStage; job_address?: string | null; start_date?: string | null; estimated_end_date?: string | null; actual_end_date?: string | null; estimated_value?: number | null; notes?: string | null; assigned_to?: string | null; id?: string; created_at?: string; updated_at?: string };
        Update: { customer_id?: string; title?: string; description?: string | null; stage?: JobStage; job_address?: string | null; start_date?: string | null; estimated_end_date?: string | null; actual_end_date?: string | null; estimated_value?: number | null; notes?: string | null; assigned_to?: string | null; updated_at?: string };
        Relationships: [];
      };
      documents: {
        Row: Document;
        Insert: { job_id: string; document_type: DocumentType; document_number: string; title: string; status?: DocumentStatus; notes?: string | null; client_notes?: string | null; tax_rate?: number; discount_amount?: number; deposit_amount?: number; due_date?: string | null; sent_at?: string | null; signed_at?: string | null; paid_at?: string | null; pdf_storage_path?: string | null; id?: string; created_at?: string; updated_at?: string };
        Update: { job_id?: string; document_type?: DocumentType; document_number?: string; title?: string; status?: DocumentStatus; notes?: string | null; client_notes?: string | null; tax_rate?: number; discount_amount?: number; deposit_amount?: number; due_date?: string | null; sent_at?: string | null; signed_at?: string | null; paid_at?: string | null; pdf_storage_path?: string | null; updated_at?: string };
        Relationships: [];
      };
      document_line_items: {
        Row: DocumentLineItem;
        Insert: { document_id: string; name: string; quantity?: number; unit?: string; unit_price: number; sort_order?: number; pricing_item_id?: string | null; description?: string | null; id?: string; created_at?: string };
        Update: { name?: string; quantity?: number; unit?: string; unit_price?: number; sort_order?: number; description?: string | null };
        Relationships: [];
      };
      document_counters: {
        Row: { document_type: DocumentType; last_number: number };
        Insert: { document_type: DocumentType; last_number?: number };
        Update: { last_number?: number };
        Relationships: [];
      };
      job_notes: {
        Row: JobNote;
        Insert: { job_id: string; content: string; author?: string; id?: string; created_at?: string };
        Update: { content?: string; author?: string };
        Relationships: [];
      };
      job_photos: {
        Row: JobPhoto;
        Insert: { job_id: string; storage_path: string; caption?: string | null; phase?: string | null; uploaded_by?: string | null; id?: string; created_at?: string };
        Update: { caption?: string | null; phase?: string | null };
        Relationships: [];
      };
      communications: {
        Row: Communication;
        Insert: { customer_id: string; channel: string; summary: string; job_id?: string | null; direction?: string; occurred_at?: string; id?: string; created_at?: string };
        Update: { channel?: string; summary?: string; direction?: string; occurred_at?: string };
        Relationships: [];
      };
      payments: {
        Row: Payment;
        Insert: { document_id: string; job_id: string; amount: number; payment_date: string; method?: string | null; reference?: string | null; notes?: string | null; id?: string; created_at?: string };
        Update: { amount?: number; payment_date?: string; method?: string | null; reference?: string | null; notes?: string | null };
        Relationships: [];
      };
      designer_commissions: {
        Row: DesignerCommission;
        Insert: { invoice_storage_path: string; job_id?: string | null; amount?: number | null; status?: CommissionStatus; submitted_at?: string; paid_at?: string | null; paid_amount?: number | null; payment_method?: string | null; notes?: string | null; id?: string; created_at?: string; updated_at?: string };
        Update: { invoice_storage_path?: string; job_id?: string | null; amount?: number | null; status?: CommissionStatus; paid_at?: string | null; paid_amount?: number | null; payment_method?: string | null; notes?: string | null; updated_at?: string };
        Relationships: [];
      };
      app_settings: {
        Row: AppSettings;
        Insert: { company_name: string; company_address?: string | null; company_phone?: string | null; company_email?: string | null; company_logo_path?: string | null; payment_terms?: string | null; default_tax_rate?: number; id?: string; updated_at?: string };
        Update: { company_name?: string; company_address?: string | null; company_phone?: string | null; company_email?: string | null; company_logo_path?: string | null; payment_terms?: string | null; default_tax_rate?: number; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      next_document_number: {
        Args: { doc_type: DocumentType };
        Returns: string;
      };
    };
    Enums: {
      job_stage: JobStage;
      document_type: DocumentType;
      document_status: DocumentStatus;
      commission_status: CommissionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
