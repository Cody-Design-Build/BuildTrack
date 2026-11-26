import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './store';
import { Shell } from './components/Layout';
import Home from './pages/Home';
import Jobs from './pages/Jobs';
import Todos from './pages/Todos';
import Schedule from './pages/Schedule';
import Messages from './pages/Messages';
import Accounts from './pages/Accounts';
import { Documents, Reports, SettingsPage, Placeholder } from './pages/Other';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/to-dos" element={<Todos />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/customers" element={<Accounts key="customer" type="customer" />} />
            <Route path="/vendors" element={<Accounts key="vendor" type="vendor" />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/catalog" element={<Placeholder title="Catalog" text="Your saved cost items and assemblies will live here." />} />
            <Route path="/files" element={<Placeholder title="Files" text="Photos, plans and uploads for your jobs will live here." />} />
            <Route path="/profile" element={<Placeholder title="Profile" text="Your name, photo and notification preferences." />} />
            <Route path="/help" element={<Placeholder title="Help Desk" text="Questions? Every page has a + button at the top right for adding things, and customers and vendors each keep their own list of contacts." />} />
            <Route path="/marketplace" element={<Placeholder title="Marketplace" text="Connections to accounting and other tools will live here." />} />
            <Route path="*" element={<Placeholder title="Not found" text="That page doesn't exist." />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </StoreProvider>
  </StrictMode>,
);
