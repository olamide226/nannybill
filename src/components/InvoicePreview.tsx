import { type AttendanceLog, type Invoice } from "../types";
import { formatClockTime, formatDurationFromIso } from "../utils/date";

interface InvoicePreviewProps {
  invoice: Invoice;
  items: AttendanceLog[];
}

function getBillingConfig(invoice: Invoice): string {
  if (invoice.billing_type === "hourly") {
    return `£${Number(invoice.hourly_rate || 0).toFixed(2)}/hr${invoice.daily_cap ? `, cap £${Number(invoice.daily_cap).toFixed(2)}/day` : ""}`;
  }

  return `£${Number(invoice.fixed_daily_rate || 0).toFixed(2)}/day`;
}

export default function InvoicePreview({ invoice, items }: InvoicePreviewProps) {
  return (
    <div className="invoice-preview-sheet">
      <div className="invoice-preview-header">
        <div>
          <div className="invoice-preview-brand">NANNYBILL</div>
          <div className="invoice-preview-subtitle">Automated Invoicing</div>
        </div>
        <div className="invoice-preview-meta">
          <strong>INVOICE</strong>
          <span>{invoice.invoice_number}</span>
          <span>{invoice.issue_date}</span>
        </div>
      </div>

      <div className="invoice-preview-parties">
        <div>
          <span className="invoice-preview-label">Billed By</span>
          <strong>Automated System</strong>
        </div>
        <div>
          <span className="invoice-preview-label">Billed To</span>
          <strong>{invoice.parent_name || ""}</strong>
          <span>{invoice.child_name || ""}</span>
          {invoice.phone && <span>{invoice.phone}</span>}
        </div>
      </div>

      <div className="invoice-preview-period">
        Billing period: {invoice.start_date} to {invoice.end_date}
      </div>

      <div className="invoice-preview-table-wrap">
        <table className="invoice-preview-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time In</th>
              <th>Time Out</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.date}</td>
                <td>{formatClockTime(item.check_in)}</td>
                <td>{item.check_out ? formatClockTime(item.check_out) : ""}</td>
                <td>{item.check_out ? formatDurationFromIso(item.check_in, item.check_out) : ""}</td>
                <td>{getBillingConfig(invoice)}</td>
                <td>£{item.calculated_charge.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="invoice-preview-footer">
        <div>
          <span className="invoice-preview-label">Payment Method</span>
          <span>Please make payments via bank transfer within 7 days.</span>
          <strong>
            Sort Code {import.meta.env.VITE_BANK_SORT_CODE || "00-00-00"} | Account {import.meta.env.VITE_BANK_ACCOUNT_NUMBER || "12345678"}
          </strong>
          <span>Account Name: {import.meta.env.VITE_BANK_ACCOUNT_NAME || "Jane Doe"}</span>
        </div>
        <div className="invoice-preview-total-box">
          <span>Status: {invoice.status}</span>
          <strong>£{invoice.total_amount.toFixed(2)}</strong>
        </div>
      </div>
    </div>
  );
}
