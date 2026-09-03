/**
 * PWA plumbing: register the service worker for offline use, and remember the
 * browser's install prompt so Settings can offer an "Install app" button.
 */
let deferredPrompt = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  });
}

export function registerServiceWorker() {
  // Skipped in dev: a caching worker fights Vite's hot reload.
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.warn('Service worker did not register:', error.message);
    });
  });
}

export const canInstall = () => deferredPrompt !== null;

export function onInstallAvailable(listener) {
  listeners.add(listener);
  listener(canInstall());
  return () => listeners.delete(listener);
}

/** Returns true if the user accepted the install prompt. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((fn) => fn(false));
  return outcome === 'accepted';
}

export const isStandalone = () => (
  typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)
);
