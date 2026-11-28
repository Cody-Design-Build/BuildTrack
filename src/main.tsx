import { StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { Shell } from './components/Layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Placeholder } from './pages/Other';
import SettingsPage from './pages/Settings';
import AgentConsent from './pages/AgentConsent';
import '@fontsource-variable/inter';
import './index.css';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/nunito';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import { initAppearance } from './appearance';
import { AppearanceSync } from './components/AppearanceSync';
import { CloudGate } from './components/CloudGate';
import { PLUGINS } from './plugins';
import { installedPlugins, registerPlugins, setChoices, usePluginStatus, usePlugins } from './plugins/registry';
import { InstalledPlugins, isSafeMode, leaveSafeMode } from './plugins/loader';

initAppearance();
registerPlugins(PLUGINS);

/** Keeps the plugin registry on the company's saved choices (they sync like any other data). */
function PluginChoicesSync({ children }: { children: ReactNode }) {
  const { db } = useStore();
  useLayoutEffect(() => setChoices(db.plugins), [db.plugins]);
  return children;
}

function NotFound() {
  const { pathname } = useLocation();
  const status = usePluginStatus();
  if (status.loading.length) return null; // an installed plugin's page may be on its way
  const owner = installedPlugins().find((p) => p.routes?.some((r) => matchPath(r.path, pathname)));
  if (owner)
    return (
      <Placeholder
        title={owner.name}
        text={<>The {owner.name} plugin is turned off. Turn it on in <Link to="/settings?section=plugins" className="underline">Settings → Plugins</Link>.</>}
      />
    );
  const failed = Object.keys(status.failed);
  if (failed.length)
    return (
      <Placeholder
        title="Not found"
        text={<>That page doesn't exist, or belongs to a plugin that didn't load. See <Link to="/settings?section=plugins" className="underline">Settings → Plugins</Link>.</>}
      />
    );
  return <Placeholder title="Not found" text="That page doesn't exist." />;
}

/** Shown while the app runs without installed plugins (opened with ?safe). */
function SafeModeBar() {
  if (!isSafeMode()) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-2 border-b bg-[color-mix(in_oklab,var(--warning)_18%,var(--background))] px-4 py-2 text-sm text-foreground">
      Safe mode: installed plugins aren't running. Fix or remove one in <Link to="/settings?section=plugins" className="underline">Settings → Plugins</Link>.
      <button type="button" className="font-medium underline" onClick={leaveSafeMode}>Leave safe mode</button>
    </div>
  );
}

/** Pages come from the plugins that are on; settings and the profile are part of the app itself. */
function AppRoutes() {
  const plugins = usePlugins();
  return (
    <Routes>
      {plugins.flatMap((p) => p.routes ?? []).map(({ path, component: Page }) => (
        <Route key={path} path={path} element={<Page />} />
      ))}
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/oauth/consent" element={<AgentConsent />} />
      <Route path="/profile" element={<Placeholder title="Profile" text="Your name, photo and notification preferences." />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudGate>{(initial) => (
    <StoreProvider initial={initial}>
      <PluginChoicesSync>
      <InstalledPlugins />
      <BrowserRouter>
        <SafeModeBar />
        <TooltipProvider delayDuration={300}>
        <AppearanceSync />
        <Shell>
          <AppRoutes />
        </Shell>
        </TooltipProvider>
      </BrowserRouter>
      </PluginChoicesSync>
    </StoreProvider>
    )}</CloudGate>
  </StrictMode>,
);
