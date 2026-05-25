import { type Client as LibsqlClient } from "@libsql/client";
import { type AttendanceLog, type Client, type Invoice } from "../types";
import { formatDateToYYYYMMDD } from "../utils/date";

export function mapClientRow(row: Record<string, unknown>): Client {
  return {
    id: String(row.id),
    parent_name: String(row.parent_name),
    child_name: String(row.child_name),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    billing_type: row.billing_type === "daily" ? "daily" : "hourly",
    hourly_rate: Number(row.hourly_rate || 0),
    daily_cap: row.daily_cap !== null && row.daily_cap !== undefined ? Number(row.daily_cap) : null,
    fixed_daily_rate: Number(row.fixed_daily_rate || 0),
    invoice_frequency: (row.invoice_frequency as "daily" | "weekly" | "monthly") || "weekly",
  };
}

function mapInvoiceRow(row: Record<string, unknown>): Invoice {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    invoice_number: String(row.invoice_number),
    issue_date: String(row.issue_date),
    due_date: String(row.due_date),
    start_date: String(row.start_date),
    end_date: String(row.end_date),
    total_amount: Number(row.total_amount || 0),
    status: (row.status as "paid" | "unpaid" | "void") || "unpaid",
    paid_at: row.paid_at ? String(row.paid_at) : null,
    child_name: String(row.child_name),
    parent_name: String(row.parent_name),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    billing_type: row.billing_type === "daily" ? "daily" : "hourly",
    hourly_rate: Number(row.hourly_rate || 0),
    daily_cap: row.daily_cap !== null && row.daily_cap !== undefined ? Number(row.daily_cap) : null,
    fixed_daily_rate: Number(row.fixed_daily_rate || 0),
  };
}

function mapAttendanceRow(row: Record<string, unknown>, invoiceId: string | null = null): AttendanceLog {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    date: String(row.date),
    check_in: String(row.check_in),
    check_out: row.check_out ? String(row.check_out) : null,
    calculated_charge: Number(row.calculated_charge || 0),
    invoice_id: invoiceId,
  };
}

export async function fetchInvoiceClients(db: LibsqlClient): Promise<Client[]> {
  const res = await db.execute("SELECT * FROM clients ORDER BY child_name ASC");
  return res.rows.map((row) => mapClientRow(row as Record<string, unknown>));
}

export async function fetchInvoicesWithClients(db: LibsqlClient): Promise<Invoice[]> {
  const res = await db.execute(`
    SELECT i.*, c.child_name, c.parent_name, c.email, c.phone, c.billing_type, c.hourly_rate, c.daily_cap, c.fixed_daily_rate
    FROM invoices i
    JOIN clients c ON i.client_id = c.id
    ORDER BY i.issue_date DESC, i.invoice_number DESC
  `);

  return res.rows.map((row) => mapInvoiceRow(row as Record<string, unknown>));
}

export async function fetchUninvoicedAttendanceLogs(
  db: LibsqlClient,
  clientId: string,
  startDate: string,
  endDate: string,
): Promise<AttendanceLog[]> {
  const res = await db.execute({
    sql: `SELECT * FROM attendance_logs
          WHERE client_id = ?
            AND date >= ?
            AND date <= ?
            AND invoice_id IS NULL
            AND check_out IS NOT NULL
          ORDER BY date ASC`,
    args: [clientId, startDate, endDate],
  });

  return res.rows.map((row) => mapAttendanceRow(row as Record<string, unknown>));
}

export async function fetchInvoiceLogs(db: LibsqlClient, invoiceId: string): Promise<AttendanceLog[]> {
  const logsRes = await db.execute({
    sql: "SELECT * FROM attendance_logs WHERE invoice_id = ? ORDER BY date ASC",
    args: [invoiceId],
  });

  return logsRes.rows.map((row) => mapAttendanceRow(row as Record<string, unknown>, invoiceId));
}

export async function createInvoiceFromLogs(
  db: LibsqlClient,
  client: Client,
  invoiceNumber: string,
  startDate: string,
  endDate: string,
  logs: AttendanceLog[],
): Promise<number> {
  const totalAmount = logs.reduce((acc, log) => acc + Number(log.calculated_charge || 0), 0);
  const roundedTotal = Math.round(totalAmount * 100) / 100;
  const invoiceId = crypto.randomUUID();
  const todayStr = formatDateToYYYYMMDD(new Date());
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const queries = [
    {
      sql: `INSERT INTO invoices (id, client_id, invoice_number, issue_date, due_date, start_date, end_date, total_amount, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid')`,
      args: [
        invoiceId,
        client.id,
        invoiceNumber.trim(),
        todayStr,
        formatDateToYYYYMMDD(dueDate),
        startDate,
        endDate,
        roundedTotal,
      ],
    },
    ...logs.map((log) => ({
      sql: "UPDATE attendance_logs SET invoice_id = ? WHERE id = ?",
      args: [invoiceId, log.id],
    })),
  ];

  await db.batch(queries, "write");
  return roundedTotal;
}

export async function toggleInvoiceStatus(db: LibsqlClient, invoice: Invoice): Promise<Invoice["status"]> {
  const nextStatus = invoice.status === "paid" ? "unpaid" : "paid";
  const paidAt = nextStatus === "paid" ? formatDateToYYYYMMDD(new Date()) : null;

  await db.execute({
    sql: "UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?",
    args: [nextStatus, paidAt, invoice.id],
  });

  return nextStatus;
}

export async function deleteInvoice(db: LibsqlClient, invoiceId: string): Promise<void> {
  await db.execute({
    sql: "DELETE FROM invoices WHERE id = ?",
    args: [invoiceId],
  });
}
