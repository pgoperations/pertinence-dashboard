import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { DateRangeProvider } from './hooks/useDateRange';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DateRangeProvider>
          <App />
        </DateRangeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
