export interface Client {
  id: string;
  parent_name: string;
  child_name: string;
  email: string | null;
  phone: string | null;
  billing_type: "hourly" | "daily";
  hourly_rate: number;
  daily_cap: number | null;
  fixed_daily_rate: number;
  invoice_frequency: "daily" | "weekly" | "monthly";
  created_at?: string;
}

export interface AttendanceLog {
  id: string;
  client_id: string;
  date: string; // YYYY-MM-DD
  check_in: string; // ISO string
  check_out: string | null; // ISO string or null
  calculated_charge: number;
  invoice_id: string | null;
  created_at?: string;

  // Joined client properties returned by complex SELECT queries
  child_name?: string;
  parent_name?: string;
  billing_type?: "hourly" | "daily";
  hourly_rate?: number;
  daily_cap?: number | null;
  fixed_daily_rate?: number;
}

export interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  issue_date: string; // YYYY-MM-DD
  due_date: string; // YYYY-MM-DD
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  total_amount: number;
  status: "paid" | "unpaid" | "void";
  paid_at: string | null;
  created_at?: string;

  // Joined client properties returned by SELECT queries
  child_name?: string;
  parent_name?: string;
  email?: string | null;
  phone?: string | null;
  billing_type?: "hourly" | "daily";
  hourly_rate?: number;
  daily_cap?: number | null;
  fixed_daily_rate?: number;
}
