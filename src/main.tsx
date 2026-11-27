import { StrictMode, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { Shell } from './components/Layout';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Placeholder } from './pages/Other';
import SettingsPage from './pages/Settings';
import '@fontsource-variable/inter';
import './index.css';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import { initAppearance } from './appearance';
import { registerThemePlugins } from './theming/registry';
import { CloudGate } from './components/CloudGate';
import { PLUGINS } from './plugins';
import { installedPlugins, registerPlugins, setChoices, usePlugins } from './plugins/registry';

registerThemePlugins(PLUGINS);
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
  const owner = installedPlugins().find((p) => p.routes?.some((r) => matchPath(r.path, pathname)));
  if (owner)
    return (
      <Placeholder
        title={owner.name}
        text={<>The {owner.name} plugin is turned off. Turn it on in <Link to="/settings?section=plugins" className="underline">Settings → Plugins</Link>.</>}
      />
    );
  return <Placeholder title="Not found" text="That page doesn't exist." />;
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
      <BrowserRouter>
        <TooltipProvider delayDuration={300}>
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
