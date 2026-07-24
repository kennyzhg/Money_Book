import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Planning from '@/pages/Planning';
import Reports from '@/pages/Reports';
import Bill from '@/pages/Bill';
import Admin from '@/pages/Admin';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
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
