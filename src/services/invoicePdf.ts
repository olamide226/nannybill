import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { type AttendanceLog, type Invoice } from "../types";
import { formatClockTime, formatDurationFromIso } from "../utils/date";

export function downloadInvoicePdf(invoice: Invoice, items: AttendanceLog[]): void {
  const doc = new jsPDF();

  doc.setFillColor(6, 11, 25);
  doc.rect(0, 0, 210, 35, "F");

  doc.setTextColor(0, 242, 254);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.text("TIME TRACKER", 15, 23);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("Helvetica", "normal");
  doc.text("Automated Invoicing", 15, 29);

  doc.setTextColor(255, 255, 255);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(14);
  doc.text("INVOICE", 155, 20);

  doc.setFontSize(9);
  doc.setFont("Helvetica", "normal");
  doc.text(`Number: ${invoice.invoice_number}`, 155, 26);
  doc.text(`Date: ${invoice.issue_date}`, 155, 31);

  doc.setTextColor(30, 41, 59);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text("BILLED BY:", 15, 50);
  doc.text("BILLED TO:", 115, 50);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Automated System", 15, 56);
  doc.text("Email: -", 15, 61);
  doc.text("United Kingdom", 15, 66);

  doc.text(`Parent Name: ${invoice.parent_name || ""}`, 115, 56);
  doc.text(`Child Name: ${invoice.child_name || ""}`, 115, 61);
  if (invoice.phone) doc.text(`Phone: ${invoice.phone}`, 115, 66);

  doc.setFillColor(241, 245, 249);
  doc.rect(15, 75, 180, 8, "F");
  doc.setTextColor(71, 85, 105);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`BILLING PERIOD: ${invoice.start_date} to ${invoice.end_date}`, 20, 80);

  const tableBody = items.map((item) => {
    const rateType = invoice.billing_type === "hourly"
      ? `£${Number(invoice.hourly_rate || 0).toFixed(2)}/hr${invoice.daily_cap ? ` (Cap: £${Number(invoice.daily_cap).toFixed(2)})` : ""}`
      : `£${Number(invoice.fixed_daily_rate || 0).toFixed(2)}/day`;

    return [
      item.date,
      formatClockTime(item.check_in),
      item.check_out ? formatClockTime(item.check_out) : "",
      item.check_out ? formatDurationFromIso(item.check_in, item.check_out) : "",
      rateType,
      `£${item.calculated_charge.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: 88,
    head: [["Date", "Check In", "Check Out", "Duration (h/m)", "Billing Config", "Subtotal (£)"]],
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 9 },
    margin: { left: 15, right: 15 },
  });

  const finalY = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 15;
  doc.setFillColor(248, 250, 252);
  doc.rect(115, finalY, 80, 22, "F");

  doc.setTextColor(30, 41, 59);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Payment Status:", 120, finalY + 8);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(invoice.status === "paid" ? 22 : 220, invoice.status === "paid" ? 163 : 38, invoice.status === "paid" ? 74 : 38);
  doc.text(invoice.status.toUpperCase(), 160, finalY + 8);

  doc.setTextColor(30, 41, 59);
  doc.text("TOTAL DUE:", 120, finalY + 16);
  doc.text(`£${invoice.total_amount.toFixed(2)}`, 160, finalY + 16);

  doc.setTextColor(100, 116, 139);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("PAYMENT METHOD:", 15, finalY + 8);
  doc.text("Please make payments via bank transfer within 7 days.", 15, finalY + 13);
  doc.setFont("Helvetica", "bold");
  doc.text("Bank Transfer: Sort Code 40-11-92 | Account 58739226", 15, finalY + 18);
  doc.text("Account Name: Abiola Adefuye", 15, finalY + 23);

  doc.save(`invoice_${invoice.invoice_number}.pdf`);
}
