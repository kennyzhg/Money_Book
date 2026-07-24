import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Planning from '@/pages/Planning';
import Reports from '@/pages/Reports';
import Bill from '@/pages/Bill';
import Admin from '@/pages/Admin';
import Login from '@/pages/Login';
import { useAuthStore } from '@/lib/auth';

/** 启动时调一次 /auth/check；未登录跳 /login */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    if (status === 'checking') bootstrap();
  }, [status, bootstrap]);

  if (status === 'checking') {
    // 简单 loading，避免闪屏
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-sm text-slate-400">加载中…</div>
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 登录页：不受 RequireAuth 保护 */}
        <Route path="/login" element={<Login />} />

        {/* 业务路由：受鉴权保护 */}
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/bill" element={<Bill />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
