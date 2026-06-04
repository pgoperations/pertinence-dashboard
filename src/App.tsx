import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { RefreshProvider } from './hooks/useRefresh';
import SignInPage from './pages/SignInPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SalesPage from './pages/SalesPage';
import MarketingPage from './pages/MarketingPage';
import CustomerSupportPage from './pages/CustomerSupportPage';
import RealtorManagementPage from './pages/RealtorManagementPage';
import MediaContentPage from './pages/MediaContentPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        element={
          <ProtectedRoute>
            <RefreshProvider>
              <AppShell />
            </RefreshProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/sales" replace />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/marketing" element={<MarketingPage />} />
        <Route path="/customer-support" element={<CustomerSupportPage />} />
        <Route path="/realtor-management" element={<RealtorManagementPage />} />
        <Route path="/media-content" element={<MediaContentPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
