import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Warehouse from './pages/Warehouse';
import LaptopDetail from './pages/LaptopDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Preorders from './pages/Preorders';
import PreorderDetail from './pages/PreorderDetail';
import Sales from './pages/Sales';
import Cash from './pages/Cash';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import ClientPortal from './pages/ClientPortal';
import Suppliers from './pages/Suppliers';
import Employees from './pages/Employees';
import Finance from './pages/Finance';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import Import from './pages/Import';
import ActivityLog from './pages/ActivityLog';
import { useAuth } from './auth/AuthContext';
import { useLang } from './i18n/LangContext';

function Guard({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'client') return <Navigate to="/portal" replace />;
  return children;
}

// Проверяет право на просмотр конкретной страницы; при отсутствии — сообщение вместо страницы
function PermGuard({ page, children }) {
  const { can } = useAuth();
  const { t } = useLang();
  if (!can(page, 'view')) return <div className="card text-text2 text-sm">🔒 {t('noAccess')}</div>;
  return children;
}

function AdminGuard({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function ClientGuard({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'client') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/portal" element={<ClientGuard><ClientPortal /></ClientGuard>} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<PermGuard page="dashboard"><Dashboard /></PermGuard>} />
        <Route path="warehouse" element={<PermGuard page="warehouse"><Warehouse /></PermGuard>} />
        <Route path="warehouse/:id" element={<PermGuard page="warehouse"><LaptopDetail /></PermGuard>} />
        <Route path="clients" element={<PermGuard page="clients"><Clients /></PermGuard>} />
        <Route path="clients/:id" element={<PermGuard page="clients"><ClientDetail /></PermGuard>} />
        <Route path="preorders" element={<PermGuard page="preorders"><Preorders /></PermGuard>} />
        <Route path="preorders/:id" element={<PermGuard page="preorders"><PreorderDetail /></PermGuard>} />
        <Route path="sales" element={<PermGuard page="sales"><Sales /></PermGuard>} />
        <Route path="cash" element={<PermGuard page="cash"><Cash /></PermGuard>} />
        <Route path="settings" element={<PermGuard page="settings"><Settings /></PermGuard>} />
        <Route path="suppliers" element={<PermGuard page="suppliers"><Suppliers /></PermGuard>} />
        <Route path="employees" element={<PermGuard page="employees"><Employees /></PermGuard>} />
        <Route path="finance" element={<PermGuard page="finance"><Finance /></PermGuard>} />
        <Route path="analytics" element={<PermGuard page="analytics"><Analytics /></PermGuard>} />
        <Route path="reports" element={<PermGuard page="reports"><Reports /></PermGuard>} />
        <Route path="import" element={<PermGuard page="import"><Import /></PermGuard>} />
        <Route path="activity-log" element={<PermGuard page="activity_log"><ActivityLog /></PermGuard>} />
        <Route path="admin" element={<AdminGuard><Admin /></AdminGuard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
