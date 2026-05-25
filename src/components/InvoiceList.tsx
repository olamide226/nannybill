import React, { useEffect, useMemo, useState } from "react";
import { getDbClient } from "../db/client";
import { type AttendanceLog, type Client, type Invoice } from "../types";
import { formatClockTime, formatDateToYYYYMMDD, formatDurationFromIso } from "../utils/date";
import {
  createInvoiceFromLogs,
  deleteInvoice,
  fetchInvoiceClients,
  fetchInvoiceLogs,
  fetchInvoicesWithClients,
  fetchUninvoicedAttendanceLogs,
  toggleInvoiceStatus,
} from "../services/invoiceService";
import { downloadInvoicePdf } from "../services/invoicePdf";
import InvoicePreview from "./InvoicePreview";
import { Calendar, Check, Download, Eye, FilePlus2, FileText, Trash2, X } from "lucide-react";

type StatusFilter = "all" | "paid" | "unpaid";

function buildInvoiceNumber(): string {
  const now = new Date();
  return `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

export default function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [uninvoicedLogs, setUninvoicedLogs] = useState<AttendanceLog[]>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState<boolean>(false);
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewItems, setPreviewItems] = useState<AttendanceLog[]>([]);

  useEffect(() => {
    fetchPageData();
  }, []);

  const fetchPageData = async () => {
    setLoading(true);
    setError("");

    try {
      const db = await getDbClient();
      if (!db) {
        setError("Database is not configured.");
        return;
      }

      const [invoiceList, clientList] = await Promise.all([
        fetchInvoicesWithClients(db),
        fetchInvoiceClients(db),
      ]);
      setInvoices(invoiceList);
      setClients(clientList);
    } catch (err) {
      console.error("Error fetching invoice data:", err);
      setError("Failed to fetch invoice lists.");
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    if (statusFilter === "all") return invoices;
    return invoices.filter((invoice) => invoice.status === statusFilter);
  }, [invoices, statusFilter]);

  const previewTotal = useMemo(() => (
    uninvoicedLogs.reduce((acc, log) => acc + Number(log.calculated_charge || 0), 0)
  ), [uninvoicedLogs]);

  const handleOpenCreateModal = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    setSelectedClient(clients[0] || null);
    setStartDate(formatDateToYYYYMMDD(startOfMonth));
    setEndDate(formatDateToYYYYMMDD(now));
    setUninvoicedLogs([]);
    setInvoiceNumber(buildInvoiceNumber());
    setError("");
    setIsModalOpen(true);
  };

  const handleFetchUninvoicedLogs = async () => {
    if (!selectedClient) return;
    setIsFetchingLogs(true);
    setError("");

    try {
      const db = await getDbClient();
      if (!db) return;

      const logs = await fetchUninvoicedAttendanceLogs(db, selectedClient.id, startDate, endDate);
      setUninvoicedLogs(logs);
      if (logs.length === 0) {
        setError("No completed attendance sessions found in this date range.");
      }
    } catch (err) {
      console.error("Error querying uninvoiced logs:", err);
      setError("Failed to query child attendance records.");
    } finally {
      setIsFetchingLogs(false);
    }
  };

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedClient) {
      setError("Select a client.");
      return;
    }
    if (uninvoicedLogs.length === 0) {
      setError("No logs to invoice. Click 'Fetch Logs' first.");
      return;
    }

    try {
      const db = await getDbClient();
      if (!db) return;

      const total = await createInvoiceFromLogs(db, selectedClient, invoiceNumber, startDate, endDate, uninvoicedLogs);
      setIsModalOpen(false);
      setSuccess(`Invoice ${invoiceNumber} created successfully. Total amount: £${total.toFixed(2)}`);
      await fetchPageData();
    } catch (err) {
      console.error("Error creating invoice:", err);
      setError("Failed to save and generate invoice record. Number might already be in use.");
    }
  };

  const handleToggleStatus = async (invoice: Invoice) => {
    try {
      const db = await getDbClient();
      if (!db) return;

      const nextStatus = await toggleInvoiceStatus(db, invoice);
      setSuccess(`Invoice ${invoice.invoice_number} marked as ${nextStatus}.`);
      await fetchPageData();
    } catch (err) {
      console.error("Error updating invoice status:", err);
      setError("Failed to update status.");
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!window.confirm("Are you sure you want to delete this invoice? Deleting the invoice will detach all attendance logs so they can be invoiced again.")) {
      return;
    }

    try {
      const db = await getDbClient();
      if (!db) return;

      await deleteInvoice(db, invoiceId);
      setSuccess("Invoice deleted successfully.");
      await fetchPageData();
    } catch (err) {
      console.error("Error deleting invoice:", err);
      setError("Failed to delete invoice.");
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    try {
      const db = await getDbClient();
      if (!db) return;

      const items = await fetchInvoiceLogs(db, invoice.id);
      downloadInvoicePdf(invoice, items);
    } catch (err) {
      console.error("PDF generation failed:", err);
      setError("Failed to compile and download PDF document.");
    }
  };

  const buildDraftInvoice = (): Invoice | null => {
    if (!selectedClient) return null;

    const issueDate = formatDateToYYYYMMDD(new Date());
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    return {
      id: "draft",
      client_id: selectedClient.id,
      invoice_number: invoiceNumber.trim() || buildInvoiceNumber(),
      issue_date: issueDate,
      due_date: formatDateToYYYYMMDD(dueDate),
      start_date: startDate,
      end_date: endDate,
      total_amount: Math.round(previewTotal * 100) / 100,
      status: "unpaid",
      paid_at: null,
      child_name: selectedClient.child_name,
      parent_name: selectedClient.parent_name,
      email: selectedClient.email,
      phone: selectedClient.phone,
      billing_type: selectedClient.billing_type,
      hourly_rate: selectedClient.hourly_rate,
      daily_cap: selectedClient.daily_cap,
      fixed_daily_rate: selectedClient.fixed_daily_rate,
    };
  };

  const handlePreviewDraft = () => {
    const draftInvoice = buildDraftInvoice();
    if (!draftInvoice || uninvoicedLogs.length === 0) {
      setError("Fetch at least one completed log before previewing the invoice.");
      return;
    }

    setPreviewInvoice(draftInvoice);
    setPreviewItems(uninvoicedLogs);
  };

  const handlePreviewSavedInvoice = async (invoice: Invoice) => {
    try {
      const db = await getDbClient();
      if (!db) return;

      const items = await fetchInvoiceLogs(db, invoice.id);
      setPreviewInvoice(invoice);
      setPreviewItems(items);
    } catch (err) {
      console.error("Invoice preview failed:", err);
      setError("Failed to load invoice preview.");
    }
  };

  const closePreview = () => {
    setPreviewInvoice(null);
    setPreviewItems([]);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="subtitle">Review, create, and print detailed PDF invoices.</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <FilePlus2 size={18} /> Create Invoice
        </button>
      </div>

      {error && <div className="alert-box alert-danger">{error}</div>}
      {success && <div className="alert-box alert-success">{success}</div>}

      <div className="segmented-control" aria-label="Invoice status filter">
        {(["all", "unpaid", "paid"] as StatusFilter[]).map((filter) => (
          <button
            key={filter}
            className={statusFilter === filter ? "active" : ""}
            onClick={() => setStatusFilter(filter)}
            type="button"
          >
            {filter}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">Loading invoices...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="empty-state">
          <FileText className="empty-state-icon" size={48} />
          <h3>No Invoices Found</h3>
          <p>
            {statusFilter === "all"
              ? "Generate a new invoice by selecting a client and date range."
              : `No ${statusFilter} invoices found.`}
          </p>
          {statusFilter === "all" && (
            <button className="btn btn-primary" onClick={handleOpenCreateModal}>
              Create Invoice Now
            </button>
          )}
        </div>
      ) : (
        <div className="table-container responsive-table">
          <table>
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Child (Parent)</th>
                <th>Billing Period</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td data-label="Invoice">
                    <div className="inline-cell-strong">
                      <FileText size={16} style={{ color: "hsl(var(--color-primary))" }} />
                      {invoice.invoice_number}
                    </div>
                  </td>
                  <td data-label="Client">
                    <div style={{ fontWeight: 500 }}>{invoice.child_name}</div>
                    <div style={{ fontSize: "0.8rem", color: "hsl(var(--text-secondary))" }}>{invoice.parent_name}</div>
                  </td>
                  <td data-label="Period">
                    <div className="muted-inline">
                      <Calendar size={12} /> {invoice.start_date} to {invoice.end_date}
                    </div>
                  </td>
                  <td data-label="Issued">{invoice.issue_date}</td>
                  <td data-label="Due">{invoice.due_date}</td>
                  <td data-label="Amount">
                    <span className="amount-text">£{invoice.total_amount.toFixed(2)}</span>
                  </td>
                  <td data-label="Status">
                    <button
                      onClick={() => handleToggleStatus(invoice)}
                      className={`badge ${invoice.status === "paid" ? "badge-success" : "badge-danger"}`}
                      style={{ border: "none", cursor: "pointer" }}
                      title={`Click to mark as ${invoice.status === "paid" ? "unpaid" : "paid"}`}
                    >
                      {invoice.status === "paid" ? <Check size={10} /> : <X size={10} />}
                      {invoice.status}
                    </button>
                  </td>
                  <td data-label="Actions">
                    <div className="row-actions">
                      <button
                        className="btn btn-secondary icon-btn"
                        onClick={() => handlePreviewSavedInvoice(invoice)}
                        title="Preview Invoice"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className="btn btn-secondary icon-btn"
                        onClick={() => handleDownloadPdf(invoice)}
                        title="Download PDF Invoice"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        className="btn btn-danger icon-btn"
                        onClick={() => handleDeleteInvoice(invoice.id)}
                        title="Delete Invoice"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content invoice-modal">
            <div className="modal-header">
              <h2>Generate New Invoice</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGenerateInvoice}>
              <div className="modal-body">
                {error && <div className="alert-box alert-danger">{error}</div>}

                <div className="form-group">
                  <label htmlFor="invClientSelect">Client / Child *</label>
                  <select
                    id="invClientSelect"
                    value={selectedClient?.id || ""}
                    onChange={(e) => {
                      const client = clients.find((item) => item.id === e.target.value);
                      setSelectedClient(client || null);
                      setUninvoicedLogs([]);
                    }}
                    required
                  >
                    <option value="">-- Choose client --</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>{client.child_name} ({client.parent_name})</option>
                    ))}
                  </select>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="invNo">Invoice Number</label>
                    <input
                      id="invNo"
                      type="text"
                      placeholder="e.g. INV-2026-0001"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      required
                    />
                  </div>
                  <div className="date-range-fields">
                    <div className="form-group">
                      <label htmlFor="invStart">Start Date</label>
                      <input
                        id="invStart"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="invEnd">End Date</label>
                      <input
                        id="invEnd"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-action-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleFetchUninvoicedLogs}
                    disabled={isFetchingLogs || !selectedClient}
                  >
                    {isFetchingLogs ? "Fetching..." : "Fetch Uninvoiced Logs"}
                  </button>
                </div>

                {uninvoicedLogs.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Uninvoiced Logs Preview</h3>
                    <div className="table-container responsive-table compact-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Time Log</th>
                            <th>Hours</th>
                            <th>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uninvoicedLogs.map((log) => (
                            <tr key={log.id}>
                              <td data-label="Date">{log.date}</td>
                              <td data-label="Time">
                                {log.check_out ? `${formatClockTime(log.check_in)} - ${formatClockTime(log.check_out)}` : formatClockTime(log.check_in)}
                              </td>
                              <td data-label="Hours">{log.check_out ? formatDurationFromIso(log.check_in, log.check_out) : "Active"}</td>
                              <td data-label="Subtotal">£{log.calculated_charge.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="invoice-preview-total">
                      <span>Total to invoice</span>
                      <strong>£{previewTotal.toFixed(2)}</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-secondary" onClick={handlePreviewDraft} disabled={uninvoicedLogs.length === 0}>
                  <Eye size={16} /> Preview
                </button>
                <button type="submit" className="btn btn-primary" disabled={uninvoicedLogs.length === 0}>
                  Generate Invoice & Link Logs
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewInvoice && (
        <div className="modal-overlay">
          <div className="modal-content invoice-preview-modal">
            <div className="modal-header">
              <h2>Invoice Preview</h2>
              <button className="close-btn" onClick={closePreview}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <InvoicePreview invoice={previewInvoice} items={previewItems} />
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closePreview}>
                Close
              </button>
              <button type="button" className="btn btn-primary" onClick={() => downloadInvoicePdf(previewInvoice, previewItems)}>
                <Download size={16} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
