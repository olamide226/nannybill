# NannyBill 🌟

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19.x-blue?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.x-64748b?logo=vite)](https://vite.dev/)
[![Database](https://img.shields.io/badge/Database-Turso%20%2F%20SQLite-00f2fe?logo=sqlite)](https://turso.tech/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

NannyBill is an elegant, premium, open-source childcare attendance tracker and automated billing system. Designed specifically for childminders, nannies, babysitters, and private nurseries, NannyBill acts as a self-hosted daycare management app that simplifies child logs, tracks attendance, calculates hourly proration with daily caps, and generates professional PDF invoices instantly.

Powered by a lightweight serverless architecture utilizing **React 19**, **TypeScript**, **Vite**, and **Turso DB (LibSQL/SQLite)**.

---

## ✨ Features

- 👤 **Client & Rate Management**: Register children and parent details, and assign customizable billing schemes (Hourly rates with optional daily caps, or fixed daily rates).
- 🕒 **Live Attendance Dashboard**: A real-time check-in/check-out board showing which children are currently present, active session duration, and live-accruing costs.
- 📑 **Automated Billing Engine**: Automatically aggregates check-in sessions, applies client billing configurations (including daily caps), and generates invoices for custom billing periods.
- 📄 **Instant PDF Export**: Generate and download beautifully styled, professional PDF invoices directly in the browser.
- 🗄️ **Flexible Storage Architecture**: Integration with Turso DB for cloud syncing, with an intuitive manual fallback to `localStorage` for quick developer setup.
- 🎨 **Premium Modern Design**: Features a highly responsive layout, interactive micro-animations, customizable dark/light/warm themes, and glassmorphic UI elements built on vanilla CSS custom properties.

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/) + [Vite](https://vite.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [Turso DB / LibSQL](https://turso.tech/) (Serverless SQLite)
- **PDF Generation**: [jsPDF](https://github.com/parallax/jsPDF) & [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 🚀 Getting Started

### 📋 Prerequisites

- **Node.js**: `v18.x` or later
- **npm**: `v9.x` or later
- A free **[Turso Database](https://turso.tech/)** instance (optional, fallback to local database config is supported).

### ⚙️ Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/olamide226/nannybill.git
   cd nannybill
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root of your project:
   ```env
   # Connect to your cloud Turso database
   VITE_TURSO_DATABASE_URL=your_turso_db_url
   VITE_TURSO_AUTH_TOKEN=your_turso_auth_token
   ```
   *Note: If no environment variables are provided, the app will prompt you for database credentials directly in the Settings dashboard and securely save them in your browser's local storage.*

4. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   The application will be running locally at `http://localhost:5173`.

5. **Build for Production**:
   ```bash
   npm run build
   ```

---

## 🗃️ Database Schema & Auto-Migrations

NannyBill handles schema migrations automatically on startup if a valid Turso connection is present. The system manages three main tables:

### 1. `clients`
Stores childcare provider contract details and billing configurations.
- `id` (UUID, Primary Key)
- `parent_name` / `child_name`
- `email` / `phone`
- `billing_type` (`hourly` | `daily`)
- `hourly_rate` / `daily_cap` / `fixed_daily_rate`
- `invoice_frequency`

### 2. `attendance_logs`
Tracks check-in/check-out sessions.
- `id` (UUID, Primary Key)
- `client_id` (Foreign Key -> `clients.id`)
- `date` (YYYY-MM-DD)
- `check_in` / `check_out` (ISO timestamps)
- `calculated_charge` (automatically computed rate)
- `invoice_id` (Foreign Key -> `invoices.id`, nullable)

### 3. `invoices`
Stores generated billing cycles and total amounts.
- `id` (UUID, Primary Key)
- `client_id` (Foreign Key -> `clients.id`)
- `invoice_number` (Unique string index)
- `issue_date` / `due_date`
- `start_date` / `end_date` (Billing cycle window)
- `total_amount`
- `status` (`unpaid` | `paid`)
- `paid_at`

---

## 🤝 Contributing

We welcome contributions from the open-source community! 

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
