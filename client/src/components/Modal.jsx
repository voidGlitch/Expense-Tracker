/**
 * Enhanced Modal Dialog components
 * Features soft entry animations, glassmorphism overlays, and elegant typography
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './ui.jsx';

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', className = '' }) {
  const panelRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle animation states
  useEffect(() => {
    if (open) {
      setShouldRender(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    } else {
      setMounted(false);
      const timer = setTimeout(() => setShouldRender(false), 200); // match transition duration
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Handle keyboard interaction & overflow
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Small delay to allow react to finish rendering content before searching DOM
    setTimeout(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector('[data-autofocus]')
        || panel?.querySelector('input:not([type=hidden]), select, textarea, button:not([aria-label="Close"])')
        || panel;
      target?.focus?.();
    }, 50);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className={`fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden bg-white shadow-2xl shadow-indigo-900/10 outline-none
          rounded-t-[2.5rem] sm:rounded-[2rem] dark:bg-slate-900 dark:shadow-none dark:border dark:border-slate-800
          transition-all duration-200
          ${mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95'}
          ${SIZES[size] || SIZES.md} ${className}
        `}
      >
        {/* Soft decorative gradient */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent dark:via-indigo-500/10 pointer-events-none" />

        <header className="flex flex-shrink-0 items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight">{title}</h2>
            {subtitle && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 -mr-2 -mt-2 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2 scrollbar-thin">
          {children}
        </div>

        {footer && (
          <footer className="flex flex-shrink-0 flex-col sm:flex-row sm:items-center justify-end gap-3 px-6 py-5 mt-2 bg-slate-50/50 dark:bg-slate-950/30 border-t border-slate-100 dark:border-slate-800/80">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Yes/no gate in front of anything destructive with warning styles. */
export function ConfirmDialog({
  open, onClose, onConfirm, title, children,
  confirmLabel = 'Delete', variant = 'danger', busy = false,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <AlertTriangle size={22} className="flex-shrink-0" />
          <span>{title}</span>
        </div>
      }
      size="sm"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button variant={variant} onClick={onConfirm} busy={busy} data-autofocus className="w-full sm:w-auto">{confirmLabel}</Button>
        </>
      )}
    >
      <div className="bg-rose-50/50 dark:bg-rose-950/20 px-4 py-3 rounded-xl border border-rose-100 dark:border-rose-900/30">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{children}</p>
      </div>
    </Modal>
  );
}
