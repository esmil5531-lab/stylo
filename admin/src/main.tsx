import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import '@fontsource/cinzel/600.css';
import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';

import { ApiError } from './api/client';
import { Layout } from './components/Layout';
import { Empty } from './components/ui';
import { DashboardPage } from './pages/Dashboard';
import { DriversPage } from './pages/Drivers';
import { OrderPage } from './pages/Order';
import { OrdersPage } from './pages/Orders';
import { StaffPage } from './pages/Staff';
import { StoresPage } from './pages/Stores';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderPage />} />
            <Route path="stores" element={<StoresPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="*" element={<Empty title="الصفحة غير موجودة" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
