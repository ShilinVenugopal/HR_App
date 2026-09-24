import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Realtime pushes invalidations, so no background polling is needed.
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (count, err) => count < 2 && !/access|not found/i.test((err as Error).message),
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster position="bottom-right" toastOptions={{ className: '!rounded-xl !shadow-card !text-sm' }} />
    </QueryClientProvider>
  </React.StrictMode>,
);
