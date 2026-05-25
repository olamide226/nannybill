import { createClient, type Client as LibsqlClient } from "@libsql/client";

let globalClient: {
  url: string;
  token: string;
  instance: LibsqlClient;
} | null = null;

/**
 * Retrieves the configured Turso DB client.
 * First checks Vite environment variables, then falls back to localStorage.
 * Returns null if no connection details are configured.
 */
export async function getDbClient(): Promise<LibsqlClient | null> {
  let url = (import.meta.env.VITE_TURSO_DATABASE_URL as string) || "";
  let token = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string) || "";

  // Fallback to localStorage if environment variables are not set
  if (!url) {
    url = localStorage.getItem("TURSO_DATABASE_URL") || "";
  }
  if (!token) {
    token = localStorage.getItem("TURSO_AUTH_TOKEN") || "";
  }

  if (!url) {
    return null;
  }

  // Cache the client instance so we don't recreate it on every call
  if (globalClient && globalClient.url === url && globalClient.token === token) {
    return globalClient.instance;
  }

  try {
    const client = createClient({
      url: url.trim(),
      authToken: token ? token.trim() : undefined,
    });

    globalClient = {
      url,
      token,
      instance: client,
    };

    return client;
  } catch (error) {
    console.error("Failed to initialize LibSQL client:", error);
    return null;
  }
}

/**
 * Runs DB migrations to initialize tables in the Turso Database.
 * This runs on app startup if a valid client is configured.
 */
export async function runMigrations(client: LibsqlClient): Promise<boolean> {
  try {
    console.log("Checking and running migrations on Turso DB...");
    
    // Batch SQL statements for SQLite tables setup
    await client.batch([
      `CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        parent_name TEXT NOT NULL,
        child_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        billing_type TEXT NOT NULL DEFAULT 'hourly',
        hourly_rate REAL DEFAULT 0.0,
        daily_cap REAL DEFAULT NULL,
        fixed_daily_rate REAL DEFAULT 0.0,
        invoice_frequency TEXT NOT NULL DEFAULT 'weekly',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );`,
      `CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL UNIQUE,
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'unpaid',
        paid_at TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS attendance_logs (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        date TEXT NOT NULL,
        check_in TEXT NOT NULL,
        check_out TEXT,
        calculated_charge REAL DEFAULT 0.0,
        invoice_id TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
      );`
    ], "write");

    console.log("Database migrations completed successfully.");
    return true;
  } catch (error) {
    console.error("Database migration failed:", error);
    throw error;
  }
}

/**
 * Clears all application data while preserving the configured database connection.
 */
export async function resetDatabase(client: LibsqlClient): Promise<boolean> {
  try {
    await client.batch([
      "DELETE FROM attendance_logs;",
      "DELETE FROM invoices;",
      "DELETE FROM clients;",
    ], "write");
    return true;
  } catch (error) {
    console.error("Database reset failed:", error);
    throw error;
  }
}

/**
 * Helper to test connection credentials.
 */
export async function testConnection(url: string, token: string): Promise<boolean> {
  try {
    const tempClient = createClient({
      url: url.trim(),
      authToken: token ? token.trim() : undefined,
    });
    // Run a simple query to verify connection
    await tempClient.execute("SELECT 1;");
    return true;
  } catch (error) {
    console.error("Connection test failed:", error);
    throw error;
  }
}
