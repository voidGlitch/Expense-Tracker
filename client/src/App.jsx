/**
 * App shell: providers, then the four states the app can be in — checking the
 * session, signed out, first-run setup, or the app proper.
 */
import { AuthProvider, useAuth } from './state/AuthContext.jsx';
import { StoreProvider, useStore } from './state/StoreContext.jsx';
import { Banner, Button, Spinner } from './components/ui.jsx';
import Shell from './components/Shell.jsx';
import AuthView from './views/AuthView.jsx';
import SetupWizard from './views/SetupWizard.jsx';

function FullPage({ children }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">{children}</div>
    </div>
  );
}

function Gate() {
  const { status } = useAuth();
  const { loading, loadError, needsSetup, store } = useStore();

  if (status === 'loading') {
    return (
      <FullPage>
        <Spinner size={28} className="mx-auto text-sky-600" />
        <p className="text-sm text-slate-500">Checking your session…</p>
      </FullPage>
    );
  }

  if (status === 'signedOut') return <AuthView />;

  if (loadError) {
    return (
      <FullPage>
        <Banner tone="error" title="Your budget could not be loaded">{loadError}</Banner>
        <Button variant="primary" onClick={() => window.location.reload()}>Try again</Button>
      </FullPage>
    );
  }

  if (loading || !store) {
    return (
      <FullPage>
        <Spinner size={28} className="mx-auto text-sky-600" />
        <p className="text-sm text-slate-500">Opening your budget…</p>
      </FullPage>
    );
  }

  return needsSetup ? <SetupWizard /> : <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <Gate />
      </StoreProvider>
    </AuthProvider>
  );
}
