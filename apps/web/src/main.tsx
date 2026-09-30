import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './index.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { ApiError, UnreachableError } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Keep showing the last data when the server drops (spec §6.3).
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      // Server down: fail fast so views show their error line; ConnectionBanner probes
      // /health and refetches everything once the API is back.
      retry: (count, err) =>
        !(err instanceof UnreachableError) &&
        !(err instanceof ApiError && err.status < 500) &&
        count < 2,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root no encontrado');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
