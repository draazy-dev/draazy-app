import { Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import Navbar from './Navbar.jsx';
import BottomNav from './BottomNav.jsx';
import Footer from './Footer.jsx';
import CityChrome from '../CityChrome.jsx';
import ConnectivityBanner from '../ConnectivityBanner.jsx';
import ErrorBoundary from '../ErrorBoundary.jsx';
import CookieConsent from '../CookieConsent.jsx';
import InstallPrompt from '../InstallPrompt.jsx';
import BrowserAlertsPrompt from '../BrowserAlertsPrompt.jsx';
import AssistantWidget from '../assistant/AssistantWidget.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { AppFlagsProvider, useAppFlags } from '../../context/AppFlagsContext.jsx';
import { PricingProvider } from '../../context/PricingContext.jsx';
import { PostChooserProvider } from '../../context/PostChooserContext.jsx';
import { chromeFor } from '../../lib/chrome.js';
import { isInternal as isInternalUser } from '../../lib/auth.js';

function MaintenanceOverlay() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center text-center p-6" style={{ background: 'rgb(var(--dz-c-ink))', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 440 }}>
        <div className="text-5xl mb-2">🛠️</div>
        <h1 className="text-2xl font-extrabold mb-2.5 gradient-text">{t('chrome.maintenanceTitle')}</h1>
        <p className="text-gray-400 leading-relaxed">{t('chrome.maintenanceBody')}</p>
      </div>
    </div>
  );
}

function ConsumerLayoutContent() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { flags } = useAppFlags();

  const isInternal = isInternalUser(user);
  const staffDoor = /^\/staff-(login|invite)/.test(pathname);
  if (flags.maintenanceMode === true && !isInternal && !staffDoor) {
    return (
      <>
        <ConnectivityBanner zClass="z-[100000]" />
        <MaintenanceOverlay />
      </>
    );
  }

  const { selfPadded, fullBleed, chatRoute, authRoute, showBottomNav, showFooter, showAssistant } = chromeFor(pathname);

  return (
    <PricingProvider>
      <PostChooserProvider>
        <div className={'consumer-layout flex min-h-[100dvh] flex-col' + (chatRoute ? ' route-messages' : '') + (authRoute ? ' route-auth' : '') + (fullBleed ? ' route-fullbleed' : '') + (showBottomNav ? ' has-bottom-nav' : '')}>
          <Navbar />
          <ConnectivityBanner />
          <main id="main-content" className={'consumer-main ' + (selfPadded ? 'flex-1' : 'flex-1 pt-[var(--dz-nav-h)]')}>
            <ErrorBoundary scope="consumer-route" resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
          {showFooter && <Footer />}
          {showAssistant && <div className="dz-assistant-slot">{<AssistantWidget />}</div>}
          <CityChrome />
          <CookieConsent />
          {!authRoute && <InstallPrompt />}
          {!authRoute && !chatRoute && <BrowserAlertsPrompt />}
          {showBottomNav && <BottomNav />}
        </div>
      </PostChooserProvider>
    </PricingProvider>
  );
}

export default function ConsumerLayout() {
  return (
    <AppFlagsProvider>
      <ConsumerLayoutContent />
    </AppFlagsProvider>
  );
}
