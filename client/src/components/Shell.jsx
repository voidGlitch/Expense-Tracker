/**
 * Enhanced Shell Component - Modern Navigation & Layout
 * Features: Glassmorphism, smooth transitions, improved mobile experience
 */
import { useState, useEffect } from 'react';
import {
  Cloud, CloudOff, History, Home, PiggyBank, Plus, ReceiptText, RefreshCw,
  Settings as SettingsIcon, Wallet, ChevronLeft, ChevronRight, Menu, X, Users
} from 'lucide-react';
import { formatMonthLabel } from '@expense/shared';
import { useAuth } from '../state/AuthContext.jsx';
import { useStore } from '../state/StoreContext.jsx';
import { usePathRoute } from '../lib/usePathRoute.js';
import { Badge, Banner, Button, Select, Spinner } from './ui.jsx';
import { ExpenseFormModal } from './ExpenseForm.jsx';
import Dashboard from '../views/Dashboard.jsx';
import ExpensesView from '../views/ExpensesView.jsx';
import BillsView from '../views/BillsView.jsx';
import SavingsView from '../views/SavingsView.jsx';
import HistoryView from '../views/HistoryView.jsx';
import SplitwiseView from '../views/SplitwiseView.jsx';
import SettingsView from '../views/SettingsView.jsx';

const NAV = [
  { id: 'dashboard', label: 'Home', icon: Home, description: 'Overview & daily spending' },
  { id: 'expenses', label: 'Spending', icon: Wallet, description: 'Track your expenses' },
  { id: 'bills', label: 'Bills', icon: ReceiptText, description: 'Manage recurring bills' },
  { id: 'savings', label: 'Savings', icon: PiggyBank, description: 'Track your savings' },
  { id: 'splitwise', label: 'Splitwise', icon: Users, description: 'Shared expenses' },
  { id: 'history', label: 'History', icon: History, description: 'Past months' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, description: 'Preferences' },
];

const VIEWS = {
  dashboard: Dashboard,
  expenses: ExpensesView,
  bills: BillsView,
  savings: SavingsView,
  splitwise: SplitwiseView,
  history: HistoryView,
  settings: SettingsView,
};

/** Enhanced save state with visual indicators */
function SaveState() {
  const { save, saveNow } = useStore();

  if (save.status === 'saving') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20">
        <Spinner size={12} />
        <span className="text-xs font-medium text-primary-700 dark:text-primary-300">Saving…</span>
      </div>
    );
  }

  if (save.status === 'offline') {
    return (
      <button
        type="button"
        onClick={saveNow}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
      >
        <CloudOff size={14} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Offline</span>
      </button>
    );
  }

  if (save.status === 'error' || save.status === 'conflict') {
    return (
      <button
        type="button"
        onClick={saveNow}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
      >
        <RefreshCw size={14} className="text-rose-600 dark:text-rose-400" aria-hidden="true" />
        <span className="text-xs font-medium text-rose-700 dark:text-rose-300">Retry</span>
      </button>
    );
  }

  if (save.status === 'saved') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
        <Cloud size={14} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Saved</span>
      </div>
    );
  }

  return null;
}

/** Sync banners with improved styling */
function SyncBanners() {
  const { save, parked, restoreParked, discardParked, reload, saveNow } = useStore();
  const [busy, setBusy] = useState(false);

  const run = (fn) => async () => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  if (parked) {
    return (
      <Banner
        variant="warn"
        title="Unsaved changes were found"
        actions={(
          <>
            <Button size="sm" variant="ghost" onClick={discardParked} disabled={busy}>Discard</Button>
            <Button size="sm" variant="primary" onClick={run(restoreParked)} busy={busy}>Save them</Button>
          </>
        )}
      >
        Changes made while you were offline are still on this device.
      </Banner>
    );
  }

  if (save.status === 'conflict') {
    return (
      <Banner
        variant="error"
        title="This budget changed somewhere else"
        actions={(
          <>
            <Button size="sm" variant="ghost" onClick={run(reload)} disabled={busy}>Load latest</Button>
            <Button size="sm" variant="danger" onClick={run(saveNow)} busy={busy}>Keep mine</Button>
          </>
        )}
      >
        {save.message}
      </Banner>
    );
  }

  if (save.status === 'error') {
    return (
      <Banner variant="error" title="Not saved" actions={<Button size="sm" variant="primary" onClick={run(saveNow)} busy={busy}>Try again</Button>}>
        {save.message}
      </Banner>
    );
  }

  return null;
}

/** Enhanced month picker with better styling */
function MonthPicker() {
  const { months, activeMonthId, setActiveMonthId, store } = useStore();
  const closed = new Set((store.months || []).filter((m) => m.status === 'closed').map((m) => m.id));

  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeMonthId}
        onChange={(event) => setActiveMonthId(event.target.value)}
        className="h-10 w-auto min-w-[11rem] py-0 text-sm font-semibold bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-slate-200 dark:border-slate-700"
      >
        {months.map((id) => (
          <option key={id} value={id}>
            {formatMonthLabel(id)}{closed.has(id) ? ' · closed' : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Desktop sidebar with collapsible feature */
function Sidebar({ collapsed, setCollapsed, route, navigate }) {
  const { user, signOut } = useAuth();

  const navButton = (item) => {
    const active = route === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => navigate(item.id)}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={`
          group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium
          transition-all duration-200
          ${active
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
          }
        `}
      >
        <item.icon
          size={20}
          className={`flex-shrink-0 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`}
          aria-hidden="true"
        />
        {!collapsed && (
          <span className="truncate">{item.label}</span>
        )}
        {!collapsed && active && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500" />
        )}
      </button>
    );
  };

  return (
    <aside
      className={`
        sticky top-0 hidden h-dvh flex-col border-r border-slate-200/80 bg-white/90 backdrop-blur-md
        transition-all duration-300 ease-in-out lg:flex dark:border-slate-800 dark:bg-slate-950/90
        ${collapsed ? 'w-[72px]' : 'w-60'}
      `}
    >
      {/* Logo & Collapse Toggle */}
      <div className="flex items-center justify-between gap-2 p-4 border-b border-slate-200/50 dark:border-slate-800">
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25">
            <PiggyBank size={20} aria-hidden="true" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-50">Expense</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">Manager</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${collapsed ? 'absolute right-2' : ''}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight size={16} className="text-slate-400" />
          ) : (
            <ChevronLeft size={16} className="text-slate-400" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map(navButton)}
      </nav>

      {/* User Section */}
      {!collapsed && (
        <div className="p-4 border-t border-slate-200/50 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center size-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 text-slate-600 dark:text-slate-300 font-semibold">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-center" onClick={signOut}>
            Sign out
          </Button>
        </div>
      )}

      {collapsed && (
        <div className="p-3 border-t border-slate-200/50 dark:border-slate-800">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center justify-center p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
            title="Sign out"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
}

/** Mobile navigation with improved styling */
function MobileNav({ route, navigate }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-950/95 overflow-x-auto">
      <div className="flex items-end justify-between px-2 pt-2 min-w-full">
        {NAV.map((item) => {
          const active = route === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`
                relative flex flex-col items-center gap-1 pb-2 pt-1 px-1 flex-1 min-w-[48px]
                transition-all duration-200
                ${active
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }
              `}
            >
              <item.icon
                size={20}
                className={`transition-transform duration-200 ${active ? 'scale-110' : ''}`}
                aria-hidden="true"
              />
              <span className="text-[9px] font-medium truncate max-w-[48px]">{item.label}</span>
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function Shell() {
  const [route, navigate] = usePathRoute();
  const { month, activeMonthId } = useStore();
  const [adding, setAdding] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const View = VIEWS[route] || Dashboard;
  const isClosed = month?.status === 'closed';

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [route]);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto flex max-w-7xl">
        {/* Desktop Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          route={route}
          navigate={navigate}
        />

        {/* Main Content */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-8">
          {/* Header */}
          <header className="sticky top-0 z-40 border-b border-slate-200/50 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
              {/* Mobile Logo */}
              <div className="flex items-center gap-2 lg:hidden">
                <div className="flex items-center justify-center size-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25">
                  <PiggyBank size={18} aria-hidden="true" />
                </div>
              </div>

              {/* Month Picker */}
              <MonthPicker />

              {/* Closed Badge */}
              {isClosed && (
                <Badge variant="secondary" size="sm">Closed</Badge>
              )}

              {/* Right Actions */}
              <div className="ml-auto flex items-center gap-3">
                <SaveState />
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => setAdding(true)}
                  className="shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 transition-shadow"
                >
                  <span className="hidden sm:inline">Add expense</span>
                </Button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="space-y-5 p-4 lg:p-6 animate-fade-in">
            <SyncBanners />
            <View onAddExpense={() => setAdding(true)} navigate={navigate} />
          </div>
        </main>
      </div>

      {/* Mobile Navigation */}
      <MobileNav route={route} navigate={navigate} />

      {/* Expense Modal */}
      <ExpenseFormModal
        open={adding}
        monthId={activeMonthId}
        onClose={() => setAdding(false)}
      />
    </div>
  );
}
