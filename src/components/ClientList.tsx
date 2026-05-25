import React, { useState, useEffect } from "react";
import { getDbClient } from "../db/client";
import { type Client } from "../types";
import { Plus, Edit2, Trash2, X, Users, Mail, Phone, Calendar } from "lucide-react";

export default function ClientList() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Form State
  const [parentName, setParentName] = useState<string>("");
  const [childName, setChildName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [billingType, setBillingType] = useState<"hourly" | "daily">("hourly");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [dailyCap, setDailyCap] = useState<string>("");
  const [fixedDailyRate, setFixedDailyRate] = useState<string>("");
  const [invoiceFrequency, setInvoiceFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    setError("");
    try {
      const db = await getDbClient();
      if (!db) {
        setError("Database is not configured.");
        setLoading(false);
        return;
      }
      const result = await db.execute("SELECT * FROM clients ORDER BY child_name ASC");
      
      // Map LibSQL rows to typed Client objects
      const clientList: Client[] = result.rows.map((row) => ({
        id: String(row.id),
        parent_name: String(row.parent_name),
        child_name: String(row.child_name),
        email: row.email ? String(row.email) : null,
        phone: row.phone ? String(row.phone) : null,
        billing_type: row.billing_type === "daily" ? "daily" : "hourly",
        hourly_rate: Number(row.hourly_rate || 0),
        daily_cap: row.daily_cap !== null && row.daily_cap !== undefined ? Number(row.daily_cap) : null,
        fixed_daily_rate: Number(row.fixed_daily_rate || 0),
        invoice_frequency: (row.invoice_frequency as "daily" | "weekly" | "monthly") || "weekly"
      }));

      setClients(clientList);
    } catch (err) {
      console.error("Error fetching clients:", err);
      setError("Failed to fetch clients from database.");
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingClient(null);
    setParentName("");
    setChildName("");
    setEmail("");
    setPhone("");
    setBillingType("hourly");
    setHourlyRate("15.00");
    setDailyCap("");
    setFixedDailyRate("50.00");
    setInvoiceFrequency("weekly");
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setParentName(client.parent_name);
    setChildName(client.child_name);
    setEmail(client.email || "");
    setPhone(client.phone || "");
    setBillingType(client.billing_type);
    setHourlyRate(client.hourly_rate ? client.hourly_rate.toString() : "");
    setDailyCap(client.daily_cap ? client.daily_cap.toString() : "");
    setFixedDailyRate(client.fixed_daily_rate ? client.fixed_daily_rate.toString() : "");
    setInvoiceFrequency(client.invoice_frequency);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!parentName.trim() || !childName.trim()) {
      setError("Parent Name and Child Name are required.");
      return;
    }

    try {
      const db = await getDbClient();
      if (!db) return;

      const rateHourly = billingType === "hourly" ? parseFloat(hourlyRate) || 0 : 0;
      const capDaily = (billingType === "hourly" && dailyCap.trim() !== "") ? parseFloat(dailyCap) : null;
      const rateDaily = billingType === "daily" ? parseFloat(fixedDailyRate) || 0 : 0;

      if (editingClient) {
        // Edit Mode
        await db.execute({
          sql: `UPDATE clients 
                SET parent_name = ?, child_name = ?, email = ?, phone = ?, 
                    billing_type = ?, hourly_rate = ?, daily_cap = ?, 
                    fixed_daily_rate = ?, invoice_frequency = ? 
                WHERE id = ?`,
          args: [
            parentName.trim(),
            childName.trim(),
            email.trim() || null,
            phone.trim() || null,
            billingType,
            rateHourly,
            capDaily,
            rateDaily,
            invoiceFrequency,
            editingClient.id
          ]
        });
      } else {
        // Create Mode
        const id = crypto.randomUUID();
        await db.execute({
          sql: `INSERT INTO clients (id, parent_name, child_name, email, phone, billing_type, hourly_rate, daily_cap, fixed_daily_rate, invoice_frequency) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            parentName.trim(),
            childName.trim(),
            email.trim() || null,
            phone.trim() || null,
            billingType,
            rateHourly,
            capDaily,
            rateDaily,
            invoiceFrequency
          ]
        });
      }

      setIsModalOpen(false);
      fetchClients();
    } catch (err) {
      console.error("Error saving client:", err);
      setError("Failed to save client details.");
    }
  };

  const handleDelete = async (clientId: string) => {
    if (window.confirm("Are you sure you want to delete this client? Deleting a client will delete all their logs and invoice history permanently!")) {
      try {
        const db = await getDbClient();
        if (!db) return;
        await db.execute({
          sql: "DELETE FROM clients WHERE id = ?",
          args: [clientId]
        });
        fetchClients();
      } catch (err) {
        console.error("Error deleting client:", err);
        setError("Failed to delete client.");
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="subtitle">Register and manage child care rates and details.</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Register Client
        </button>
      </div>

      {error && (
        <div className="alert-box alert-danger" style={{ marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "hsl(var(--text-secondary))" }}>Loading clients...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="empty-state">
          <Users className="empty-state-icon" size={48} />
          <h3>No Clients Registered</h3>
          <p>Register your first client to start tracking attendance and generating invoices.</p>
          <button className="btn btn-primary" onClick={openAddModal} style={{ marginTop: "0.5rem" }}>
            Register Now
          </button>
        </div>
      ) : (
        <div className="table-container responsive-table">
          <table>
            <thead>
              <tr>
                <th>Child's Name</th>
                <th>Parent's Name</th>
                <th>Contact Info</th>
                <th>Billing Configuration</th>
                <th>Billing Cycle</th>
                <th style={{ width: "100px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td data-label="Child">
                    <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{client.child_name}</div>
                  </td>
                  <td data-label="Parent">
                    <div style={{ color: "hsl(var(--text-secondary))" }}>{client.parent_name}</div>
                  </td>
                  <td data-label="Contact">
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.85rem" }}>
                      {client.email && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "hsl(var(--text-secondary))" }}>
                          <Mail size={12} /> {client.email}
                        </span>
                      )}
                      {client.phone && (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "hsl(var(--text-secondary))" }}>
                          <Phone size={12} /> {client.phone}
                        </span>
                      )}
                      {!client.email && !client.phone && <span style={{ color: "hsl(var(--text-muted))" }}>No contact details</span>}
                    </div>
                  </td>
                  <td data-label="Billing">
                    <div className="client-rate-info">
                      {client.billing_type === "hourly" ? (
                        <>
                          <span className="client-rate-amount">£{client.hourly_rate.toFixed(2)}/hr</span>
                          {client.daily_cap !== null && client.daily_cap > 0 && (
                            <span className="client-rate-cap">Cap: £{client.daily_cap.toFixed(2)}/day</span>
                          )}
                        </>
                      ) : (
                        <span className="client-rate-amount">£{client.fixed_daily_rate.toFixed(2)}/day (Flat)</span>
                      )}
                    </div>
                  </td>
                  <td data-label="Cycle">
                    <span className="badge badge-info" style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                      <Calendar size={12} /> {client.invoice_frequency}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div className="row-actions">
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => openEditModal(client)} 
                        style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)" }}
                        title="Edit Client"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        className="btn btn-danger" 
                        onClick={() => handleDelete(client.id)} 
                        style={{ padding: "0.5rem", borderRadius: "var(--radius-sm)", color: "hsl(var(--color-danger))" }}
                        title="Delete Client"
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

      {/* Register/Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingClient ? "Edit Client Profile" : "Register New Client"}</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave}>
              <div className="modal-body">
                {error && (
                  <div className="alert-box alert-danger" style={{ marginBottom: "1rem" }}>
                    {error}
                  </div>
                )}
                
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="childName">Child's Name *</label>
                    <input
                      id="childName"
                      type="text"
                      placeholder="e.g. Charlie Brown"
                      value={childName}
                      onChange={(e) => setChildName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="parentName">Parent's Name *</label>
                    <input
                      id="parentName"
                      type="text"
                      placeholder="e.g. Lucy Brown"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input
                      id="email"
                      type="email"
                      placeholder="lucy@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone Number</label>
                    <input
                      id="phone"
                      type="tel"
                      placeholder="e.g. 07123 456789"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="billingType">Billing Structure</label>
                  <select
                    id="billingType"
                    value={billingType}
                    onChange={(e) => setBillingType(e.target.value as "hourly" | "daily")}
                  >
                    <option value="hourly">Hourly Billing (GBP/hr)</option>
                    <option value="daily">Fixed Daily Billing (GBP/day)</option>
                  </select>
                </div>

                {billingType === "hourly" ? (
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="hourlyRate">Hourly Rate (£ GBP) *</label>
                      <input
                        id="hourlyRate"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="15.00"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        required={billingType === "hourly"}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="dailyCap">Daily Cap (£ GBP, Optional)</label>
                      <input
                        id="dailyCap"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g. 70.00"
                        value={dailyCap}
                        onChange={(e) => setDailyCap(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-group">
                    <label htmlFor="fixedDailyRate">Fixed Daily Rate (£ GBP) *</label>
                    <input
                      id="fixedDailyRate"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="50.00"
                      value={fixedDailyRate}
                      onChange={(e) => setFixedDailyRate(e.target.value)}
                      required={billingType === "daily"}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="invoiceFrequency">Preferred Billing Cycle</label>
                  <select
                    id="invoiceFrequency"
                    value={invoiceFrequency}
                    onChange={(e) => setInvoiceFrequency(e.target.value as "daily" | "weekly" | "monthly")}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingClient ? "Save Changes" : "Register Child"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
