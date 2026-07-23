# AuraDesk — Offline-First POS & Salon Management System (PWA)

<div align="center">

![React 19](https://img.shields.io/badge/React-19.0.1-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Database_%26_Auth-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PWA Ready](https://img.shields.io/badge/PWA-Standalone_App-D98897?style=for-the-badge&logo=pwa&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-Unit_Tested-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.style=for-the-badge)

<p align="center">
  <b>AuraDesk</b> is an enterprise-grade, offline-first Point of Sale (POS) and appointment scheduling Progressive Web Application custom-designed for <i>Fenina Salon & Reflexology</i>.
</p>

</div>

---

## 🌟 Key Features

### 🛒 1. Smart POS Terminal
- **Fast Cart Management**: Instant service and product selection with real-time Rupiah calculations.
- **Loyalty Tier Discounts**: Automatic discount application based on customer tiers (Silver, Gold 5%, Platinum 10%).
- **Split Payment Methods**: Supports cash, QRIS, debit/credit cards, and manual bank transfer proof.
- **Thermal Receipt Printing**: Instant print preview formatted for standard 58mm/80mm thermal receipt printers.

### 📶 2. Reliable Offline-First Architecture
- **Local Cache & Queue**: All operational transactions, appointments, and customer modifications are instantly persisted locally using **IndexedDB**.
- **AES-GCM Encryption**: Encrypted queue storage ensuring zero sensitive data exposure during offline periods.
- **FIFO Auto-Sync**: Automatic background synchronization to Supabase cloud as soon as network connectivity is restored.

### 📱 3. Native Progressive Web App (PWA)
- **Installable Desktop & Mobile App**: Built-in PWA configuration allowing one-click installation to Windows, macOS, Android, and iOS home screens.
- **Dedicated Install Interface**: Integrated settings panel detecting standalone execution mode, native install prompts, and step-by-step iOS Safari guides.
- **Service Worker Cache**: Fast app loading and offline static asset serving via `vite-plugin-pwa`.

### 📅 4. Booking & Appointment Matrix
- **Visual Therapist Matrix**: Real-time daily timeline tracking slots across all active therapists.
- **Status Workflow**: Seamless lifecycle management (`Scheduled` ➔ `In Progress` ➔ `Done` / `Cancelled`).
- **One-Click Checkout Transfer**: Move appointment details straight to the POS cart for immediate settlement.

### 👥 5. Customer Database & Staff RBAC
- **Customer CRM**: Comprehensive tracking of customer visits, total spend, and automated tier upgrades via Supabase database triggers.
- **Role-Based Access Control (RBAC)**: Strict role boundaries for `Owner/Manager`, `Kasir/Front Desk`, and `Terapis`.

---

## 🏗️ System Architecture

```
                               ┌────────────────────────────────┐
                               │     AuraDesk React 19 PWA      │
                               └───────────────┬────────────────┘
                                               │
                                 ┌─────────────┴─────────────┐
                                 ▼                           ▼
                     ┌───────────────────────┐   ┌───────────────────────┐
                     │ IndexedDB Local Queue │   │   React Query Cache   │
                     │  (AES-GCM Encrypted)  │   │  (Offline-First Store)│
                     └───────────┬───────────┘   └───────────┬───────────┘
                                 │                           │
                                 │ (Network Status Check)    │
                                 ├─────────── Offline ───────┤ (Reads from local DB)
                                 │                           │
                                 ▼ (FIFO Sync when Online)   │
                     ┌───────────────────────────────────────▼───┐
                     │          Supabase Cloud Backend           │
                     │  (PostgreSQL, Row-Level Security, Auth)   │
                     └───────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack & Dependencies

- **Frontend Core**: React 19, TypeScript ~5.8, Vite 6.2
- **Styling**: Tailwind CSS v4, Lucide React Icons, Motion (Framer Motion)
- **Database & Sync**: Supabase JS SDK, `idb` (IndexedDB Wrapper), TanStack Query v5
- **Testing**: Vitest (Unit Tests), Playwright (E2E Tests)
- **Deployment**: Vercel / Netlify / Nginx PWA Ready

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and `npm`

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/lan090/system-pos.git
   cd system-pos
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the root directory:
   ```env
   VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:3000`.

---

## 📦 Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run dev` | Runs the development server with HMR on port 3000 |
| `npm run build` | Builds the production bundle & PWA service worker |
| `npm run preview` | Previews the production build locally |
| `npm run lint` | Runs TypeScript type-checking without emitting files |
| `npx vitest run` | Executes all unit test suites using Vitest |
| `npm run test:e2e` | Runs end-to-end integration tests using Playwright |

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
