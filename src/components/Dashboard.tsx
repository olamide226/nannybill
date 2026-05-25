import React, { useState, useEffect } from "react";
import { getDbClient } from "../db/client";
import { type Client, type AttendanceLog } from "../types";
import { 
  Play, Square, Plus, Trash2, Edit2, Calendar, 
  Clock, DollarSign, Award, X 
} from "lucide-react";

interface EarningStats {
  todayExpected: number;
  todayActual: number;
  weekExpected: number;
  weekActual: number;
  monthExpected: number;
  monthActual: number;
}

export default function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeLogs, setActiveLogs] = useState<Record<string, AttendanceLog>>({}); // client_id -> active log object
  const [recentLogs, setRecentLogs] = useState<AttendanceLog[]>([]);
  const [stats, setStats] = useState<EarningStats>({
    todayExpected: 0, todayActual: 0,
    weekExpected: 0, weekActual: 0,
    monthExpected: 0, monthActual: 0
  });

  // Modal States
  const [isCheckOutModalOpen, setIsCheckOutModalOpen] = useState<boolean>(false);
  const [isManualLogModalOpen, setIsManualLogModalOpen] = useState<boolean>(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeCheckInLog, setActiveCheckInLog] = useState<AttendanceLog | null>(null);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  // Edit/Checkout Form Fields
  const [manualDate, setManualDate] = useState<string>("");
  const [manualCheckIn, setManualCheckIn] = useState<string>("");
  const [manualCheckOut, setManualCheckOut] = useState<string>("");
  const [editLogId, setEditLogId] = useState<string | null>(null);

  // Live Timer State (trigger rerenders to update running costs)
  const [timeTrigger, setTimeTrigger] = useState<number>(0);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      setTimeTrigger(prev => prev + 1);
    }, 60000); // update every minute
    return () => clearInterval(interval);
  }, [timeTrigger]);

  const fetchData = async () => {
    try {
      const db = await getDbClient();
      if (!db) return;

      // 1. Fetch Clients
      const clientsResult = await db.execute("SELECT * FROM clients ORDER BY child_name ASC");
      const clientList: Client[] = clientsResult.rows.map(row => ({
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

      // 2. Fetch Active Logs (check_out IS NULL)
      const activeLogsResult = await db.execute(
        "SELECT * FROM attendance_logs WHERE check_out IS NULL"
      );
      const activeMap: Record<string, AttendanceLog> = {};
      activeLogsResult.rows.forEach(row => {
        activeMap[String(row.client_id)] = {
          id: String(row.id),
          client_id: String(row.client_id),
          date: String(row.date),
          check_in: String(row.check_in),
          check_out: null,
          calculated_charge: Number(row.calculated_charge || 0),
          invoice_id: row.invoice_id ? String(row.invoice_id) : null
        };
      });
      setActiveLogs(activeMap);

      // 3. Fetch Today's Logs (completed and active)
      const todayStr = getLocalDateString();
      const recentLogsResult = await db.execute({
        sql: `SELECT l.*, c.child_name, c.parent_name, c.billing_type, c.hourly_rate, c.daily_cap, c.fixed_daily_rate 
              FROM attendance_logs l 
              JOIN clients c ON l.client_id = c.id 
              WHERE l.date = ? 
              ORDER BY l.check_in DESC`,
        args: [todayStr]
      });

      const recentLogsList: AttendanceLog[] = recentLogsResult.rows.map(row => ({
        id: String(row.id),
        client_id: String(row.client_id),
        date: String(row.date),
        check_in: String(row.check_in),
        check_out: row.check_out ? String(row.check_out) : null,
        calculated_charge: Number(row.calculated_charge || 0),
        invoice_id: row.invoice_id ? String(row.invoice_id) : null,
        child_name: String(row.child_name),
        parent_name: String(row.parent_name),
        billing_type: row.billing_type === "daily" ? "daily" : "hourly",
        hourly_rate: Number(row.hourly_rate || 0),
        daily_cap: row.daily_cap !== null && row.daily_cap !== undefined ? Number(row.daily_cap) : null,
        fixed_daily_rate: Number(row.fixed_daily_rate || 0)
      }));
      setRecentLogs(recentLogsList);

      // 4. Calculate Earnings Stats
      const activeRowsList: AttendanceLog[] = activeLogsResult.rows.map(row => ({
        id: String(row.id),
        client_id: String(row.client_id),
        date: String(row.date),
        check_in: String(row.check_in),
        check_out: null,
        calculated_charge: Number(row.calculated_charge || 0),
        invoice_id: row.invoice_id ? String(row.invoice_id) : null
      }));
      await calculateStats(db, clientList, activeRowsList);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError("Failed to sync dashboard details.");
    }
  };

  const calculateStats = async (db: any, clientList: Client[], activeRows: AttendanceLog[]) => {
    const todayStr = getLocalDateString();
    
    // Dates for week and month ranges
    const now = new Date();
    
    // Start of current week (Monday)
    const currentDay = now.getDay();
    const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diffToMonday));
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const startOfWeekStr = formatDateToYYYYMMDD(startOfWeek);
    const startOfMonthStr = formatDateToYYYYMMDD(startOfMonth);

    try {
      // Get all completed logs from start of month to today
      const completedLogsResult = await db.execute({
        sql: `SELECT l.*, c.billing_type, c.hourly_rate, c.daily_cap, c.fixed_daily_rate 
              FROM attendance_logs l 
              JOIN clients c ON l.client_id = c.id 
              WHERE l.date >= ? AND l.check_out IS NOT NULL`,
        args: [startOfMonthStr]
      });

      // Get all paid invoices issued this month
      const paidInvoicesResult = await db.execute({
        sql: "SELECT * FROM invoices WHERE status = 'paid' AND issue_date >= ?",
        args: [startOfMonthStr]
      });

      // Unpaid invoices issued this month
      const unpaidInvoicesResult = await db.execute({
        sql: "SELECT * FROM invoices WHERE status = 'unpaid' AND issue_date >= ?",
        args: [startOfMonthStr]
      });

      let tExp = 0, tAct = 0;
      let wExp = 0, wAct = 0;
      let mExp = 0, mAct = 0;

      // Add completed logs charges
      completedLogsResult.rows.forEach((row: any) => {
        const charge = parseFloat(row.calculated_charge || 0);
        const logDate = String(row.date);
        const isInvoiced = row.invoice_id !== null;
        
        if (!isInvoiced) {
          if (logDate === todayStr) {
            tExp += charge;
          }
          if (logDate >= startOfWeekStr) {
            wExp += charge;
          }
          if (logDate >= startOfMonthStr) {
            mExp += charge;
          }
        }
      });

      // Add invoices totals (paid and unpaid)
      const addInvoicesToStats = (invoicesRows: any[], isPaid: boolean) => {
        invoicesRows.forEach(row => {
          const amt = parseFloat(row.total_amount || 0);
          const issueDate = String(row.issue_date);

          if (issueDate === todayStr) {
            tExp += amt;
            if (isPaid) tAct += amt;
          }
          if (issueDate >= startOfWeekStr) {
            wExp += amt;
            if (isPaid) wAct += amt;
          }
          if (issueDate >= startOfMonthStr) {
            mExp += amt;
            if (isPaid) mAct += amt;
          }
        });
      };

      addInvoicesToStats(paidInvoicesResult.rows, true);
      addInvoicesToStats(unpaidInvoicesResult.rows, false);

      // Add running costs of currently checked in children
      const clientsMap: Record<string, Client> = {};
      clientList.forEach(c => { clientsMap[c.id] = c; });

      activeRows.forEach(log => {
        const client = clientsMap[log.client_id];
        if (client) {
          const currentCharge = calculateProratedCharge(log.check_in, client);
          const logDate = log.date;

          if (logDate === todayStr) {
            tExp += currentCharge;
          }
          if (logDate >= startOfWeekStr) {
            wExp += currentCharge;
          }
          if (logDate >= startOfMonthStr) {
            mExp += currentCharge;
          }
        }
      });

      setStats({
        todayExpected: tExp, todayActual: tAct,
        weekExpected: wExp, weekActual: wAct,
        monthExpected: mExp, monthActual: mAct
      });
    } catch (err) {
      console.error("Error calculating dashboard metrics:", err);
    }
  };

  // Billing calculation helper (proration & caps)
  const calculateProratedCharge = (checkInIso: string, client: Client): number => {
    const checkIn = new Date(checkInIso);
    const now = new Date();
    const diffMs = now.getTime() - checkIn.getTime();
    if (diffMs <= 0) return 0;

    const diffMins = Math.round(diffMs / 60000);
    const hours = diffMins / 60;

    if (client.billing_type === "hourly") {
      const rawCost = hours * Number(client.hourly_rate || 0);
      if (client.daily_cap !== null && client.daily_cap > 0) {
        return Math.min(rawCost, Number(client.daily_cap));
      }
      return rawCost;
    } else {
      // Daily flat rate
      return Number(client.fixed_daily_rate || 0);
    }
  };

  const getLocalDateString = (): string => {
    const d = new Date();
    return formatDateToYYYYMMDD(d);
  };

  const formatDateToYYYYMMDD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleCheckIn = async (client: Client) => {
    setError("");
    setSuccess("");
    try {
      const db = await getDbClient();
      if (!db) return;

      const todayStr = getLocalDateString();
      const logId = crypto.randomUUID();
      const checkInIso = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO attendance_logs (id, client_id, date, check_in, check_out, calculated_charge) 
              VALUES (?, ?, ?, ?, NULL, 0.0)`,
        args: [logId, client.id, todayStr, checkInIso]
      });

      setSuccess(`${client.child_name} checked in successfully.`);
      fetchData();
    } catch (err) {
      console.error("Check-in error:", err);
      setError("Failed to record check-in.");
    }
  };

  const openCheckOutModal = (client: Client, log: AttendanceLog) => {
    setSelectedClient(client);
    setActiveCheckInLog(log);
    
    // Set default check-out input values
    const now = new Date();
    const localTimeStr = now.toTimeString().slice(0, 5); // HH:MM
    
    const checkInDate = new Date(log.check_in);
    const checkInTimeStr = checkInDate.toTimeString().slice(0, 5);

    setManualDate(log.date);
    setManualCheckIn(checkInTimeStr);
    setManualCheckOut(localTimeStr);
    setError("");
    setIsCheckOutModalOpen(true);
  };

  const processCheckOut = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!manualCheckIn || !manualCheckOut || !manualDate || !selectedClient || !activeCheckInLog) {
      setError("Please fill in all checkout time fields.");
      return;
    }

    try {
      const db = await getDbClient();
      if (!db) return;

      // Construct absolute timestamps
      const checkInDateTime = new Date(`${manualDate}T${manualCheckIn}:00`);
      const checkOutDateTime = new Date(`${manualDate}T${manualCheckOut}:00`);

      if (checkOutDateTime <= checkInDateTime) {
        setError("Check-out time must be after check-in time.");
        return;
      }

      // Calculate elapsed hours
      const diffMs = checkOutDateTime.getTime() - checkInDateTime.getTime();
      const diffMins = Math.round(diffMs / 60000);
      const hours = diffMins / 60;

      let charge = 0;
      if (selectedClient.billing_type === "hourly") {
        const raw = hours * Number(selectedClient.hourly_rate || 0);
        charge = (selectedClient.daily_cap !== null && selectedClient.daily_cap > 0)
          ? Math.min(raw, Number(selectedClient.daily_cap))
          : raw;
      } else {
        charge = Number(selectedClient.fixed_daily_rate || 0);
      }

      // Round charge to 2 decimal places (pence)
      charge = Math.round(charge * 100) / 100;

      await db.execute({
        sql: `UPDATE attendance_logs 
              SET check_in = ?, check_out = ?, calculated_charge = ? 
              WHERE id = ?`,
        args: [
          checkInDateTime.toISOString(),
          checkOutDateTime.toISOString(),
          charge,
          activeCheckInLog.id
        ]
      });

      setIsCheckOutModalOpen(false);
      setSuccess(`${selectedClient.child_name} checked out successfully. Charge: £${charge.toFixed(2)}`);
      fetchData();
    } catch (err) {
      console.error("Check-out processing error:", err);
      setError("Failed to record child checkout.");
    }
  };

  // Add a manual log retroactively
  const openManualLogModal = () => {
    setSelectedClient(clients[0] || null);
    setEditLogId(null);
    
    const today = getLocalDateString();
    setManualDate(today);
    setManualCheckIn("09:00");
    setManualCheckOut("15:00");
    setError("");
    setIsManualLogModalOpen(true);
  };

  const openEditLogModal = (log: AttendanceLog) => {
    const clientObj = clients.find(c => c.id === log.client_id);
    setSelectedClient(clientObj || null);
    setEditLogId(log.id);

    const checkInTime = new Date(log.check_in).toTimeString().slice(0, 5);
    const checkOutTime = log.check_out ? new Date(log.check_out).toTimeString().slice(0, 5) : "";

    setManualDate(log.date);
    setManualCheckIn(checkInTime);
    setManualCheckOut(checkOutTime);
    setError("");
    setIsManualLogModalOpen(true);
  };

  const handleSaveManualLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedClient) {
      setError("Please select a client.");
      return;
    }
    if (!manualDate || !manualCheckIn || !manualCheckOut) {
      setError("All date and time fields are required.");
      return;
    }

    try {
      const db = await getDbClient();
      if (!db) return;

      const checkInDateTime = new Date(`${manualDate}T${manualCheckIn}:00`);
      const checkOutDateTime = new Date(`${manualDate}T${manualCheckOut}:00`);

      if (checkOutDateTime <= checkInDateTime) {
        setError("Check-out time must be after check-in time.");
        return;
      }

      // Calculate cost
      const diffMs = checkOutDateTime.getTime() - checkInDateTime.getTime();
      const diffMins = Math.round(diffMs / 60000);
      const hours = diffMins / 60;

      let charge = 0;
      if (selectedClient.billing_type === "hourly") {
        const raw = hours * Number(selectedClient.hourly_rate || 0);
        charge = (selectedClient.daily_cap !== null && selectedClient.daily_cap > 0)
          ? Math.min(raw, Number(selectedClient.daily_cap))
          : raw;
      } else {
        charge = Number(selectedClient.fixed_daily_rate || 0);
      }

      charge = Math.round(charge * 100) / 100;

      if (editLogId) {
        // Edit log
        await db.execute({
          sql: `UPDATE attendance_logs 
                SET client_id = ?, date = ?, check_in = ?, check_out = ?, calculated_charge = ? 
                WHERE id = ?`,
          args: [
            selectedClient.id,
            manualDate,
            checkInDateTime.toISOString(),
            checkOutDateTime.toISOString(),
            charge,
            editLogId
          ]
        });
        setSuccess("Attendance log updated successfully.");
      } else {
        // Create log
        const logId = crypto.randomUUID();
        await db.execute({
          sql: `INSERT INTO attendance_logs (id, client_id, date, check_in, check_out, calculated_charge) 
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            logId,
            selectedClient.id,
            manualDate,
            checkInDateTime.toISOString(),
            checkOutDateTime.toISOString(),
            charge
          ]
        });
        setSuccess("Attendance log added retroactively.");
      }

      setIsManualLogModalOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error saving manual/edited log:", err);
      setError("Failed to save attendance record.");
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (window.confirm("Are you sure you want to delete this attendance record?")) {
      try {
        const db = await getDbClient();
        if (!db) return;
        await db.execute({
          sql: "DELETE FROM attendance_logs WHERE id = ?",
          args: [logId]
        });
        setSuccess("Log deleted successfully.");
        fetchData();
      } catch (err) {
        console.error("Error deleting log:", err);
        setError("Failed to delete attendance record.");
      }
    }
  };

  // Helper to format live check-in elapsed details
  const renderLiveStatus = (client: Client) => {
    const activeLog = activeLogs[client.id];
    if (!activeLog) return null;

    const checkInTime = new Date(activeLog.check_in);
    const now = new Date();
    const diffMs = now.getTime() - checkInTime.getTime();
    const diffMins = Math.max(0, Math.round(diffMs / 60000));
    
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    const runningCost = calculateProratedCharge(activeLog.check_in, client);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span style={{ color: "hsl(var(--color-primary))", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <Clock size={14} /> Checked In: {checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span style={{ fontSize: "0.85rem", color: "hsl(var(--text-secondary))" }}>
          Duration: {h}h {m}m
        </span>
        <span style={{ fontSize: "0.85rem", color: "hsl(var(--color-warning))", fontWeight: 500 }}>
          Running Cost: £{runningCost.toFixed(2)}
        </span>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">Track real-time check-ins and expected revenue.</p>
        </div>
        <button className="btn btn-secondary" onClick={openManualLogModal}>
          <Plus size={18} /> Retroactive Log
        </button>
      </div>

      {error && <div className="alert-box alert-danger" style={{ marginBottom: "1.5rem" }}>{error}</div>}
      {success && <div className="alert-box alert-success" style={{ marginBottom: "1.5rem" }}>{success}</div>}

      {/* Metrics Dashboard */}
      <div className="metrics-grid">
        <div className="card metric-card">
          <div className="metric-info">
            <span className="metric-title">Today's Revenue</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span className="metric-value currency">£{stats.todayExpected.toFixed(2)}</span>
              <span style={{ fontSize: "0.85rem", color: "hsl(var(--color-success))" }}>
                (£{stats.todayActual.toFixed(2)} paid)
              </span>
            </div>
          </div>
          <div className="metric-icon-box">
            <DollarSign size={22} />
          </div>
        </div>

        <div className="card metric-card">
          <div className="metric-info">
            <span className="metric-title">This Week's Revenue</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span className="metric-value currency">£{stats.weekExpected.toFixed(2)}</span>
              <span style={{ fontSize: "0.85rem", color: "hsl(var(--color-success))" }}>
                (£{stats.weekActual.toFixed(2)} paid)
              </span>
            </div>
          </div>
          <div className="metric-icon-box">
            <Calendar size={22} />
          </div>
        </div>

        <div className="card metric-card">
          <div className="metric-info">
            <span className="metric-title">This Month's Revenue</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span className="metric-value currency">£{stats.monthExpected.toFixed(2)}</span>
              <span style={{ fontSize: "0.85rem", color: "hsl(var(--color-success))" }}>
                (£{stats.monthActual.toFixed(2)} paid)
              </span>
            </div>
          </div>
          <div className="metric-icon-box">
            <Award size={22} />
          </div>
        </div>
      </div>

      <div className="dashboard-board-grid">
        {/* Left Section: Live Check-in Grid */}
        <div className="card">
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={20} style={{ color: "hsl(var(--color-primary))" }} /> Attendance Board
          </h2>
          {clients.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "hsl(var(--text-secondary))" }}>
              Please register clients to see them on the attendance board.
            </div>
          ) : (
            <div className="check-in-grid">
              {clients.map(client => {
                const isActive = !!activeLogs[client.id];
                return (
                  <div key={client.id} className={`check-in-card ${isActive ? "active" : ""}`}>
                    <div className="check-in-card-header">
                      <div>
                        <div className="child-name">{client.child_name}</div>
                        <div className="parent-name">{client.parent_name}</div>
                      </div>
                      <span className={`badge ${isActive ? "badge-success" : "badge-secondary"}`}>
                        {isActive ? "Present" : "Absent"}
                      </span>
                    </div>

                    <div className="check-in-card-body">
                      {isActive ? (
                        renderLiveStatus(client)
                      ) : (
                        <div style={{ color: "hsl(var(--text-muted))" }}>
                          Rate: {client.billing_type === "hourly" 
                            ? `£${client.hourly_rate.toFixed(2)}/hr` 
                            : `£${client.fixed_daily_rate.toFixed(2)}/day`
                          }
                          {client.daily_cap !== null && client.daily_cap > 0 && ` (Cap: £${client.daily_cap.toFixed(2)})`}
                        </div>
                      )}
                    </div>

                    <div className="check-in-card-actions">
                      {isActive ? (
                        <button 
                          className="btn btn-danger" 
                          style={{ flex: 1, padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                          onClick={() => openCheckOutModal(client, activeLogs[client.id])}
                        >
                          <Square size={14} /> Check Out
                        </button>
                      ) : (
                        <button 
                          className="btn btn-primary" 
                          style={{ flex: 1, padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                          onClick={() => handleCheckIn(client)}
                        >
                          <Play size={14} /> Check In
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Section: Today's Activity */}
        <div className="card">
          <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Calendar size={20} style={{ color: "hsl(var(--color-secondary))" }} /> Today's Activity
          </h2>
          
          {recentLogs.length === 0 ? (
            <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.9rem", textAlign: "center", padding: "2rem" }}>
              No child logs recorded for today yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {recentLogs.map(log => {
                const isCompleted = log.check_out !== null;
                const checkInDate = new Date(log.check_in);
                const checkOutDate = isCompleted ? new Date(log.check_out as string) : null;
                const durationMins = isCompleted && checkOutDate ? Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 60000) : 0;
                const h = Math.floor(durationMins / 60);
                const m = durationMins % 60;

                return (
                  <div 
                    key={log.id} 
                    style={{ 
                      backgroundColor: "hsl(var(--bg-tertiary) / 30%)", 
                      border: "1px solid hsl(var(--border-light))", 
                      borderRadius: "var(--radius-md)", 
                      padding: "0.85rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600 }}>{log.child_name}</span>
                      <span style={{ fontWeight: 700, color: "hsl(var(--color-warning))", fontSize: "0.95rem" }}>
                        {isCompleted ? `£${log.calculated_charge.toFixed(2)}` : "Active"}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "hsl(var(--text-secondary))" }}>
                      <span>
                        {checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {
                          isCompleted && checkOutDate ? checkOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "now"
                        }
                        {isCompleted && ` (${h}h ${m}m)`}
                      </span>
                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        {isCompleted && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: "0.25rem", borderRadius: "4px" }}
                            onClick={() => openEditLogModal(log)}
                            title="Edit Record"
                          >
                            <Edit2 size={12} />
                          </button>
                        )}
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: "0.25rem", borderRadius: "4px", color: "hsl(var(--color-danger))" }}
                          onClick={() => handleDeleteLog(log.id)}
                          title="Delete Record"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Check Out Modal */}
      {isCheckOutModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Check Out {selectedClient?.child_name}</h2>
              <button className="close-btn" onClick={() => setIsCheckOutModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={processCheckOut}>
              <div className="modal-body">
                {error && <div className="alert-box alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}
                
                <p style={{ color: "hsl(var(--text-secondary))", marginBottom: "1.25rem", fontSize: "0.95rem" }}>
                  Confirm or adjust check-in/out times. The charge will be calculated automatically based on billing rules.
                </p>

                <div className="form-group">
                  <label htmlFor="checkoutDate">Date</label>
                  <input
                    id="checkoutDate"
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="checkoutIn">Check In Time</label>
                    <input
                      id="checkoutIn"
                      type="time"
                      value={manualCheckIn}
                      onChange={(e) => setManualCheckIn(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="checkoutOut">Check Out Time</label>
                    <input
                      id="checkoutOut"
                      type="time"
                      value={manualCheckOut}
                      onChange={(e) => setManualCheckOut(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCheckOutModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Checkout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual / Edit Log Modal */}
      {isManualLogModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editLogId ? "Edit Attendance Log" : "Add Retroactive Log"}</h2>
              <button className="close-btn" onClick={() => setIsManualLogModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveManualLog}>
              <div className="modal-body">
                {error && <div className="alert-box alert-danger" style={{ marginBottom: "1rem" }}>{error}</div>}

                <div className="form-group">
                  <label htmlFor="manualClientSelect">Select Child</label>
                  <select
                    id="manualClientSelect"
                    value={selectedClient?.id || ""}
                    onChange={(e) => {
                      const c = clients.find(cl => cl.id === e.target.value);
                      setSelectedClient(c || null);
                    }}
                    disabled={!!editLogId}
                    required
                  >
                    {!editLogId && <option value="">-- Choose child --</option>}
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.child_name} ({c.parent_name})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="manualLogDate">Date</label>
                  <input
                    id="manualLogDate"
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="manualLogIn">Check In Time</label>
                    <input
                      id="manualLogIn"
                      type="time"
                      value={manualCheckIn}
                      onChange={(e) => setManualCheckIn(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="manualLogOut">Check Out Time</label>
                    <input
                      id="manualLogOut"
                      type="time"
                      value={manualCheckOut}
                      onChange={(e) => setManualCheckOut(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsManualLogModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
