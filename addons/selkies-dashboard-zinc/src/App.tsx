import React from 'react';
import DashboardOverlay from './components/DashboardOverlay';
import { ThemeProvider } from './components/ui/theme-provider';
import { Toaster } from 'sonner';

interface AppProps {
  dashboardRoot: Element;
}

function App({ dashboardRoot }: AppProps): React.ReactElement {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <DashboardOverlay container={dashboardRoot} />
      <Toaster 
        position="bottom-right"
        richColors
        closeButton
      />
    </ThemeProvider>
  );
}

export default App; 