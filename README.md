# 🛠️ Spare Part Inventory Management System

A full-stack web application designed to manage spare part inventory, procurement workflows, and production tracking.

## 🚀 Overview

This system provides a comprehensive interface for managing spare parts, including stock levels, purchase requests (PR), purchase orders (PO), and delivery orders (DO). It features a modern React frontend and a robust Express.js backend.

### Key Features
- **Inventory Management**: Track stock levels, locations, and part details.
- **Workflow Automation**: Manage the full procurement lifecycle from PR to DO.
- **Visual Dashboards**: Interactive charts and data visualization using Recharts.
- **Part Recognition**: Integrated TensorFlow.js for potential part identification (experimental).
- **Exporting**: Generate PDF and Excel reports for inventory data.
- **Secure Access**: JWT-based authentication and role-based permissions.

---

## 🏗️ Technical Stack

### Frontend
- **Framework**: React 19 (Vite)
- **Styling**: Vanilla CSS / Modern UI
- **Icons**: Lucide React
- **Data Fetching**: Axios
- **Visualization**: Recharts
- **Utils**: Dayjs (time), XLSX (Excel), jsPDF (PDF), QRCode.react

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **Authentication**: JWT (jsonwebtoken) & bcryptjs
- **File Handling**: Multer (for uploads)

---

## 📂 Project Structure

```text
sparepart-app/
├── backend/            # Express.js API server
│   ├── routes/         # API endpoints
│   ├── controllers/    # Business logic
│   ├── config/         # Database and env config
│   └── server.js       # Entry point
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Application views
│   │   └── services/   # API communication
│   └── vite.config.js  # Vite configuration
└── walkthrough.md      # Detailed deployment guide
```

---

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- MySQL Server
- npm or yarn

### 1. Database Setup
1. Create a MySQL database named `sparepartinventorydb`.
2. Import the initial schema (if available) or wait for migrations.

### 2. Backend Configuration
1. Navigate to `/backend`.
2. Create a `.env` file based on the following template:
```ini
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=sparepartinventorydb
JWT_SECRET=your_jwt_secret
PORT=5050
UPLOAD_DIR=./uploads
```
3. Run `npm install`.
4. Start dev server: `npm run dev`.

### 3. Frontend Setup
1. Navigate to `/frontend`.
2. Run `npm install`.
3. Start dev server: `npm run dev`.
4. Access the app at `http://localhost:5173`.

---

## 🌐 Deployment (Windows IIS)

The application is optimized for deployment on Windows IIS using `iisnode` and `URL Rewrite`.

- **Target Port**: 5050
- **Guide**: See [walkthrough.md](walkthrough.md) for step-by-step IIS configuration.

---

## 📜 Metadata
- **Version**: 1.0.0
- **Author**: Engineering Assy 2
- **Environment**: Production READY
