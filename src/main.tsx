import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { StoreProvider } from './store';
import { Shell } from './components/Layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import Home from './pages/Home';
import Jobs from './pages/Jobs';
import Tasks from './pages/Tasks';
import Schedule from './pages/Schedule';
import Accounts from './pages/Accounts';
import People from './pages/People';
import Budgets from './pages/Budgets';
import BudgetDetail from './pages/BudgetDetail';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import { Documents, Reports, SettingsPage, Placeholder } from './pages/Other';
import '@fontsource-variable/inter';
import './index.css';

function LegacyTasksRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/tasks', search, hash }} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <TooltipProvider delayDuration={300}>
        <Shell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/to-dos" element={<LegacyTasksRedirect />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/budgets/:id" element={<BudgetDetail />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/:id" element={<InvoiceDetail />} />
            <Route path="/people" element={<People />} />
            <Route path="/accounts" element={<Accounts />} />
            {/* old addresses from the customer/vendor pages */}
            <Route path="/customers" element={<Navigate to="/accounts?type=Customer" replace />} />
            <Route path="/vendors" element={<Navigate to="/accounts?type=Vendor" replace />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/catalog" element={<Placeholder title="Catalog" text="Your saved cost items and assemblies will live here." />} />
            <Route path="/files" element={<Placeholder title="Files" text="Photos, plans and uploads for your jobs will live here." />} />
            <Route path="/profile" element={<Placeholder title="Profile" text="Your name, photo and notification preferences." />} />
            <Route path="*" element={<Placeholder title="Not found" text="That page doesn't exist." />} />
          </Routes>
        </Shell>
        </TooltipProvider>
      </BrowserRouter>
    </StoreProvider>
  </StrictMode>,
);
