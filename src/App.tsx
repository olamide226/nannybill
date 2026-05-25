import React, { useState, useEffect } from "react";
import { getDbClient, runMigrations } from "./db/client";
import Dashboard from "./components/Dashboard";
import ClientList from "./components/ClientList";
import InvoiceList from "./components/InvoiceList";
import Settings from "./components/Settings";
import { 
  LayoutDashboard, Users, FileText, Settings as SettingsIcon, 
  AlertCircle, RefreshCw 
} from "lucide-react";

type TabName = "dashboard" | "clients" | "invoices" | "settings";
export type ThemeName = "dark" | "light" | "warm";

interface MigrationStatus {
  loading: boolean;
  error: string;
}

export default function App() {
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [checkingConfig, setCheckingConfig] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<TabName>("dashboard");
  const [activeDbUrl, setActiveDbUrl] = useState<string>("");
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus>({ loading: false, error: "" });
  const [theme, setTheme] = useState<ThemeName>(() => {
    const savedTheme = localStorage.getItem("APP_THEME");
    return savedTheme === "light" || savedTheme === "warm" ? savedTheme : "dark";
  });

  useEffect(() => {
    checkDatabaseConfiguration();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("APP_THEME", theme);
  }, [theme]);

  const checkDatabaseConfiguration = async () => {
    setCheckingConfig(true);
    setMigrationStatus({ loading: false, error: "" });
    try {
      const client = await getDbClient();
      if (client) {
        const url = localStorage.getItem("TURSO_DATABASE_URL") || (import.meta.env.VITE_TURSO_DATABASE_URL as string) || "";
        setActiveDbUrl(url);
        
        setMigrationStatus({ loading: true, error: "" });
        await runMigrations(client);
        
        setIsConfigured(true);
      } else {
        setIsConfigured(false);
      }
    } catch (err: any) {
      console.error("Database connection/migration check failed on boot:", err);
      setMigrationStatus({ 
        loading: false, 
        error: `Connected to database but failed migrations: ${err.message || "Unknown schema error"}. Please check your database settings or credentials.` 
      });
      setIsConfigured(true);
    } finally {
      setCheckingConfig(false);
    }
  };

  const handleConfigChanged = () => {
    checkDatabaseConfiguration();
  };

  if (checkingConfig) {
    return (
      <div className="onboarding-container" style={{ flexDirection: "column", gap: "1rem" }}>
        <RefreshCw size={40} className="spin-animation" style={{ color: "hsl(var(--color-primary))" }} />
        <p style={{ color: "hsl(var(--text-secondary))", fontWeight: 500 }}>
          Detecting database configuration & running migrations...
        </p>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="onboarding-container">
        <div style={{ width: "100%", maxWidth: "485px" }}>
          <div className="onboarding-header">
            <h1 className="brand-logo" style={{ fontSize: "2.2rem" }}>TIME TRACK</h1>
            <p style={{ color: "hsl(var(--text-secondary))", marginTop: "0.5rem" }}>
              Experience-First Childcare Time Tracker
            </p>
          </div>
          <Settings
            onConfigChanged={handleConfigChanged}
            isEmbedded={false}
            currentTheme={theme}
            onThemeChanged={setTheme}
          />
        </div>
      </div>
    );
  }

  const navItems: { tab: TabName; label: string; icon: React.ReactNode }[] = [
    { tab: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { tab: "clients", label: "Clients", icon: <Users size={18} /> },
    { tab: "invoices", label: "Invoices", icon: <FileText size={18} /> },
    { tab: "settings", label: "Settings", icon: <SettingsIcon size={18} /> },
  ];

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">TIME TRACK</span>
        </div>

        <nav style={{ flex: 1 }}>
          <ul className="nav-links">
            {navItems.map(({ tab, label, icon }) => (
              <li key={tab}>
                <button 
                  className={`nav-item ${currentTab === tab ? "active" : ""}`}
                  onClick={() => setCurrentTab(tab)}
                  style={{ width: "100%", border: "none", background: "none", textAlign: "left" }}
                >
                  {icon} {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Database Status Panel */}
        <div 
          style={{ 
            marginTop: "auto", 
            padding: "0.85rem", 
            backgroundColor: "hsl(var(--bg-tertiary) / 40%)", 
            borderRadius: "var(--radius-md)",
            border: "1px solid hsl(var(--border-light))",
            fontSize: "0.8rem"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
            <span 
              style={{ 
                width: "8px", 
                height: "8px", 
                backgroundColor: migrationStatus.error ? "hsl(var(--color-danger))" : "hsl(var(--color-success))", 
                borderRadius: "50%",
                display: "inline-block"
              }} 
            />
            <span style={{ fontWeight: 600, color: "hsl(var(--text-primary))" }}>Turso Connection</span>
          </div>
          <p 
            style={{ 
              color: "hsl(var(--text-secondary))", 
              whiteSpace: "nowrap", 
              overflow: "hidden", 
              textOverflow: "ellipsis" 
            }}
            title={activeDbUrl}
          >
            {activeDbUrl.replace("libsql://", "").replace("https://", "")}
          </p>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        {migrationStatus.error && (
          <div className="alert-box alert-danger" style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{migrationStatus.error}</span>
          </div>
        )}
        
        {currentTab === "dashboard" && <Dashboard />}
        {currentTab === "clients" && <ClientList />}
        {currentTab === "invoices" && <InvoiceList />}
        {currentTab === "settings" && (
          <Settings
            onConfigChanged={handleConfigChanged}
            isEmbedded={true}
            currentTheme={theme}
            onThemeChanged={setTheme}
          />
        )}
      </main>
    </div>
  );
}
