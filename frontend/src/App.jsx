import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PartsListPage from './pages/parts/PartsListPage';
import PartFormPage from './pages/parts/PartFormPage';
import PartDetailPage from './pages/parts/PartDetailPage';
import PartLocationPage from './pages/parts/PartLocationPage';
import StockInPage from './pages/stock/StockInPage';
import StockOutPage from './pages/stock/StockOutPage';
import TransactionHistoryPage from './pages/transactions/TransactionHistoryPage';
import UsersPage from './pages/users/UsersPage';
import ReportsPage from './pages/reports/ReportsPage';

// Procurement
import PRPage from './pages/procurement/PRPage';
import POPage from './pages/procurement/POPage';
import DOPage from './pages/procurement/DOPage';
import PublicStockOutPage from './pages/stock/PublicStockOutPage';
import PublicPartInfoPage from './pages/stock/PublicPartInfoPage';

function PrivateRoute({ children, maxLevel }) {
  const { isAuthenticated, level } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (maxLevel !== undefined && level > maxLevel) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />

      {/* Parts */}
      <Route path="/parts" element={<PrivateRoute><PartsListPage /></PrivateRoute>} />
      <Route path="/parts/new" element={<PrivateRoute maxLevel={2}><PartFormPage /></PrivateRoute>} />
      <Route path="/parts/:seiPartNumber" element={<PrivateRoute><PartDetailPage /></PrivateRoute>} />
      <Route path="/parts/:seiPartNumber/edit" element={<PrivateRoute maxLevel={2}><PartFormPage /></PrivateRoute>} />

      <Route path="/locations" element={<PrivateRoute><PartLocationPage /></PrivateRoute>} />

      {/* Stock */}
      <Route path="/stock-in" element={<PrivateRoute><StockInPage /></PrivateRoute>} />
      <Route path="/stock-out" element={<PrivateRoute><StockOutPage /></PrivateRoute>} />

      {/* Records */}
      <Route path="/transactions" element={<PrivateRoute><TransactionHistoryPage /></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute maxLevel={3}><ReportsPage /></PrivateRoute>} />

      {/* Procurement */}
      <Route path="/procurement/pr" element={<PrivateRoute maxLevel={3}><PRPage /></PrivateRoute>} />
      <Route path="/procurement/po" element={<PrivateRoute maxLevel={2}><POPage /></PrivateRoute>} />
      <Route path="/procurement/do" element={<PrivateRoute maxLevel={3}><DOPage /></PrivateRoute>} />

      {/* Admin */}
      <Route path="/users" element={<PrivateRoute><UsersPage /></PrivateRoute>} />

      {/* Public */}
      <Route path="/public/stock-out" element={<PublicStockOutPage />} />
      <Route path="/public/part-info" element={<PublicPartInfoPage />} />

      {/* Default */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
