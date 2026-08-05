import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, RequireSuperAdmin } from './components/common/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Recruitment from './pages/Recruitment';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import Wages from './pages/Wages';
import ProjectWagesPage from './pages/ProjectWagesPage';
import Compliance from './pages/Compliance';
import Advances from './pages/Advances';
import Inventory from './pages/Inventory';
import PurchaseRequisitions from './pages/PurchaseRequisitions';
import PurchaseRequisitionDetail from './pages/PurchaseRequisitionDetail';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import VendorManagement from './pages/VendorManagement';
import GoodsReceivedNotes from './pages/GoodsReceivedNotes';
import GoodsReceivedNoteDetail from './pages/GoodsReceivedNoteDetail';
import ProcurementDashboard from './pages/ProcurementDashboard';
import BillingStatus from './pages/BillingStatus';
import SiteAccounts from './pages/SiteAccounts';
import SiteAccountDetail from './pages/SiteAccountDetail';
import CostCodeMaster from './pages/CostCodeMaster';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';
import UserManagement from './pages/UserManagement';
import AuditLogs from './pages/AuditLogs';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/recruitment" element={<Recruitment />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/wages" element={<Wages />} />
          <Route path="/wages/:code" element={<ProjectWagesPage />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/advances" element={<Advances />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/purchase-requisitions" element={<PurchaseRequisitions />} />
          <Route path="/purchase-requisitions/:id" element={<PurchaseRequisitionDetail />} />
          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
          <Route path="/vendors" element={<VendorManagement />} />
          <Route path="/grns" element={<GoodsReceivedNotes />} />
          <Route path="/grns/:id" element={<GoodsReceivedNoteDetail />} />
          <Route path="/procurement-dashboard" element={<ProcurementDashboard />} />
          <Route path="/billing-status" element={<BillingStatus />} />
          <Route path="/site-accounts" element={<SiteAccounts />} />
          <Route path="/site-accounts/:id" element={<SiteAccountDetail />} />
          <Route path="/cost-code-master" element={<CostCodeMaster />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/user-management"
            element={
              <RequireSuperAdmin>
                <UserManagement />
              </RequireSuperAdmin>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <RequireSuperAdmin>
                <AuditLogs />
              </RequireSuperAdmin>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
