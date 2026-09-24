import { useEffect, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { RealtimeProvider } from '@/context/RealtimeContext';
import Layout, { Logo } from '@/components/Layout';
import { Spinner } from '@/components/ui';
import { ChangePasswordPage, LoginPage } from '@/pages/AuthPages';
import DashboardPage from '@/pages/DashboardPage';
import TaskListPage from '@/pages/TaskListPage';
import TaskFormPage from '@/pages/TaskFormPage';
import TaskDetailPage from '@/pages/TaskDetailPage';
import ChatPage from '@/pages/ChatPage';
import NotificationsPage from '@/pages/NotificationsPage';
import UsersPage from '@/pages/UsersPage';
import SettingsPage from '@/pages/SettingsPage';
import ProfilePage from '@/pages/ProfilePage';

function Splash() {
  return (
    <div className="drag flex h-full flex-col items-center justify-center gap-4 bg-navy-950">
      <Logo className="h-14 w-14" />
      <Spinner className="text-accent-400" />
    </div>
  );
}

/** Tray menu items ("My Tasks", "Chat"…) navigate the renderer. */
function TrayNavigation() {
  const navigate = useNavigate();
  useEffect(() => window.forays?.onNavigate((route) => navigate(route)), [navigate]);
  return null;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}

function SignedInApp() {
  return (
    <RealtimeProvider>
      <TrayNavigation />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tasks/mine" element={<TaskListPage mode="mine" />} />
          <Route path="tasks/assigned" element={<TaskListPage mode="assigned" />} />
          <Route
            path="tasks/all"
            element={
              <AdminOnly>
                <TaskListPage mode="all" />
              </AdminOnly>
            }
          />
          <Route path="tasks/new" element={<TaskFormPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="tasks/:id/edit" element={<TaskFormPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:conversationId" element={<ChatPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route
            path="users"
            element={
              <AdminOnly>
                <UsersPage />
              </AdminOnly>
            }
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </RealtimeProvider>
  );
}

function Gate() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Splash />;
  if (!session) return <LoginPage />;
  if (!profile) return <Splash />; // loading profile (or offline at start-up; retried on reconnect)
  if (profile.must_change_password) return <ChangePasswordPage />;
  return <SignedInApp />;
}

export default function App() {
  return (
    <HashRouter>
      <Gate />
    </HashRouter>
  );
}
