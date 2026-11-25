import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/cinzel/500.css';
import './tokens.css';
import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';

import { ApiError } from './api/client';
import { Layout } from './components/Layout';
import { Empty } from './components/ui';
import { DashboardPage } from './pages/Dashboard';
import { BannersPage } from './pages/Banners';
import { CategoriesPage } from './pages/Categories';
import { LooksPage } from './pages/Looks';
import { CustodyPage } from './pages/Custody';
import { DriversPage } from './pages/Drivers';
import { OrderPage } from './pages/Order';
import { MyStorePage } from './pages/MyStore';
import { OrdersPage } from './pages/Orders';
import { PayoutsPage } from './pages/Payouts';
import { ProductFormPage } from './pages/ProductForm';
import { ProductsPage } from './pages/Products';
import { ReportsPage } from './pages/Reports';
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
      {/* Served under /admin/ (vite `base`), both in development and production. */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="products/new" element={<ProductFormPage />} />
            <Route path="products/:id" element={<ProductFormPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="looks" element={<LooksPage />} />
            <Route path="banners" element={<BannersPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="payouts" element={<PayoutsPage />} />
            <Route path="custody" element={<CustodyPage />} />
            <Route path="my-store" element={<MyStorePage />} />
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
