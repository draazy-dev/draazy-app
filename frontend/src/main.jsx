import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CityProvider } from './context/CityContext.jsx';
import { CompareProvider } from './context/CompareContext.jsx';
import { SavedProvider } from './context/SavedContext.jsx';
import { FollowProvider } from './context/FollowContext.jsx';
import { SavedSearchProvider } from './context/SavedSearchContext.jsx';
import { VerificationProvider } from './context/VerificationContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { ConversationProvider } from './context/ConversationContext.jsx';
import { SupportChatProvider } from './context/SupportChatContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { SignInGateProvider } from './context/SignInGateContext.jsx';
import { installMapsLoader } from './lib/mapsConfig.js';
import { installGlobalErrorHandlers } from './lib/errorReporter.js';
import { initPmf } from './lib/pmf.js';
import { initProductAnalytics } from './lib/productAnalytics.js';
import { loadGeoPolicy } from './lib/geoConfig.js';
import { readAccessToken } from './lib/auth.js';
import { primeMeBootstrap } from './services/meBootstrapService.js';
import './i18n';
// Ahead of index.css so @font-face lands before anything sets font-family.
import './styles/fonts.css';
import './styles/index.css';
import './styles/components/buttons.css';
import './styles/components/surfaces.css';
import './styles/components/chips.css';
import './styles/components/date-time-fields.css';
import './styles/components/dropdown.css';
import './styles/theme.css';

initPmf();
initProductAnalytics();
installGlobalErrorHandlers();
installMapsLoader();

if ('scrollRestoration' in history) {
  const navEntry = performance.getEntriesByType?.('navigation')?.[0];
  if (navEntry?.type === 'reload') history.scrollRestoration = 'manual';
}

const app = (
  <StrictMode>
    <ErrorBoundary scope="app">
    <BrowserRouter>
      <AuthProvider>
        <CityProvider>
          <SavedProvider>
            <SavedSearchProvider>
              <FollowProvider>
              <VerificationProvider>
              <ConversationProvider>
                <SupportChatProvider>
                <NotificationProvider>
                  <CompareProvider>
                    <ToastProvider>
                      <SignInGateProvider>
                        <App />
                      </SignInGateProvider>
                    </ToastProvider>
                  </CompareProvider>
                </NotificationProvider>
                </SupportChatProvider>
              </ConversationProvider>
              </VerificationProvider>
              </FollowProvider>
            </SavedSearchProvider>
          </SavedProvider>
        </CityProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);

document.documentElement.dataset.dzBoot = 'ready';
loadGeoPolicy();
window.addEventListener('draazy-settings-change', loadGeoPolicy);
if (readAccessToken()) primeMeBootstrap();
createRoot(document.getElementById('root')).render(app);
