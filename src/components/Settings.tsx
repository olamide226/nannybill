import React, { useEffect, useState } from "react";
import { createClient } from "@libsql/client";
import { getDbClient, resetDatabase, runMigrations, testConnection } from "../db/client";
import { type ThemeName } from "../App";
import { CheckCircle2, Database, Palette, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";

interface SettingsProps {
  onConfigChanged: () => void;
  isEmbedded?: boolean;
  currentTheme: ThemeName;
  onThemeChanged: (theme: ThemeName) => void;
}

interface ConnectionStatus {
  type: "success" | "danger" | "info" | "";
  message: string;
}

export default function Settings({
  onConfigChanged,
  isEmbedded = false,
  currentTheme,
  onThemeChanged,
}: SettingsProps) {
  const [dbUrl, setDbUrl] = useState<string>("");
  const [authToken, setAuthToken] = useState<string>("");
  const [status, setStatus] = useState<ConnectionStatus>({ type: "", message: "" });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  useEffect(() => {
    const url = localStorage.getItem("TURSO_DATABASE_URL") || (import.meta.env.VITE_TURSO_DATABASE_URL as string) || "";
    const token = localStorage.getItem("TURSO_AUTH_TOKEN") || (import.meta.env.VITE_TURSO_AUTH_TOKEN as string) || "";
    setDbUrl(url);
    setAuthToken(token);
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbUrl) {
      setStatus({ type: "danger", message: "Database URL is required." });
      return;
    }

    setIsLoading(true);
    setStatus({ type: "info", message: "Connecting to database..." });

    try {
      await testConnection(dbUrl, authToken);

      const client = createClient({
        url: dbUrl.trim(),
        authToken: authToken ? authToken.trim() : undefined,
      });

      setStatus({ type: "info", message: "Running database migrations..." });
      await runMigrations(client);

      localStorage.setItem("TURSO_DATABASE_URL", dbUrl.trim());
      localStorage.setItem("TURSO_AUTH_TOKEN", authToken ? authToken.trim() : "");

      setStatus({
        type: "success",
        message: "Successfully connected to Turso DB. Database schema is initialized.",
      });
      onConfigChanged();
    } catch (error: any) {
      console.error(error);
      setStatus({
        type: "danger",
        message: `Failed to connect: ${error.message || "Unknown error occurred"}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    if (!window.confirm("Are you sure you want to clear your database settings? This will log you out from this database instance.")) {
      return;
    }

    localStorage.removeItem("TURSO_DATABASE_URL");
    localStorage.removeItem("TURSO_AUTH_TOKEN");
    setDbUrl("");
    setAuthToken("");
    setStatus({ type: "success", message: "Database credentials cleared successfully." });
    onConfigChanged();
  };

  const handleResetDatabase = async () => {
    const confirmation = window.prompt("Type RESET to permanently delete all clients, attendance logs, and invoices from this database.");
    if (confirmation !== "RESET") return;

    setIsResetting(true);
    setStatus({ type: "info", message: "Resetting database records..." });

    try {
      const client = await getDbClient();
      if (!client) {
        setStatus({ type: "danger", message: "Database is not configured." });
        return;
      }

      await resetDatabase(client);
      setStatus({ type: "success", message: "Database reset complete. Connection settings were kept." });
      onConfigChanged();
    } catch (error: any) {
      console.error(error);
      setStatus({
        type: "danger",
        message: `Failed to reset database: ${error.message || "Unknown error occurred"}`,
      });
    } finally {
      setIsResetting(false);
    }
  };

  const connectionConfigured = Boolean(localStorage.getItem("TURSO_DATABASE_URL") || (import.meta.env.VITE_TURSO_DATABASE_URL as string));

  return (
    <div className="settings-grid">
      <div className={`card ${!isEmbedded ? "onboarding-card" : ""}`}>
        <div className="settings-card-heading">
          <div className="metric-icon-box" style={{ color: "hsl(var(--color-primary))" }}>
            <Database size={24} />
          </div>
          <h2>Database Settings</h2>
        </div>

        <p className="subtitle">
          {!isEmbedded
            ? "Configure your serverless Turso managed SQLite database. Enter your credentials to initialize the schema."
            : "Manage your database URL and Authentication Token. Changing these will connect the app to a different database."}
        </p>

        {status.message && (
          <div className={`alert-box alert-${status.type}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {status.type === "danger" && <ShieldAlert size={18} style={{ flexShrink: 0 }} />}
            {status.type === "success" && <CheckCircle2 size={18} style={{ flexShrink: 0 }} />}
            {status.type === "info" && <RefreshCw size={18} className="spin-animation" style={{ flexShrink: 0 }} />}
            <span>{status.message}</span>
          </div>
        )}

        <form onSubmit={handleConnect} className="settings-form">
          <div className="form-group">
            <label htmlFor="dbUrl">Turso Database URL</label>
            <input
              id="dbUrl"
              type="text"
              placeholder="libsql://your-database-name-orgname.turso.io"
              value={dbUrl}
              onChange={(e) => setDbUrl(e.target.value)}
              disabled={isLoading}
              required
            />
            <span className="field-hint">Usually starts with <code>libsql://</code> or <code>https://</code></span>
          </div>

          <div className="form-group">
            <label htmlFor="authToken">Auth Token (Optional)</label>
            <input
              id="authToken"
              type="password"
              placeholder="eyJh..."
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              disabled={isLoading}
            />
            <span className="field-hint">Generated via <code>turso db tokens create &lt;db-name&gt;</code></span>
          </div>

          <div className="settings-actions">
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? "Connecting..." : "Test & Save Connection"}
            </button>

            {connectionConfigured && (
              <button type="button" className="btn btn-danger" onClick={handleClear} disabled={isLoading}>
                Disconnect
              </button>
            )}
          </div>
        </form>
      </div>

      {isEmbedded && (
        <>
          <div className="card">
            <div className="settings-card-heading">
              <div className="metric-icon-box">
                <Palette size={22} />
              </div>
              <h2>Appearance</h2>
            </div>

            <div className="theme-options" role="radiogroup" aria-label="Theme">
              {(["dark", "light", "warm"] as ThemeName[]).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={`theme-option ${currentTheme === theme ? "active" : ""}`}
                  onClick={() => onThemeChanged(theme)}
                  aria-pressed={currentTheme === theme}
                >
                  <span className={`theme-swatch theme-swatch-${theme}`} />
                  <span>{theme}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card danger-zone">
            <div className="settings-card-heading">
              <div className="metric-icon-box danger-icon">
                <RotateCcw size={22} />
              </div>
              <h2>Reset Database</h2>
            </div>
            <p className="subtitle">
              Delete all clients, attendance records, and invoices in the current database. Your saved Turso connection stays in place.
            </p>
            <button type="button" className="btn btn-danger" onClick={handleResetDatabase} disabled={isResetting}>
              <RotateCcw size={16} />
              {isResetting ? "Resetting..." : "Reset All Records"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
