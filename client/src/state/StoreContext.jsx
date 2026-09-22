/**
 * The budget document: loaded once, mutated with the pure reducers from
 * `@expense/shared`, then written back with a debounce and a revision lock.
 *
 * Views never assemble a store by hand — they call `apply(store => nextStore)`.
 * The result renders immediately and is saved about a second later, so holding a
 * stepper or typing in a field is not a stream of requests. If the network is
 * down the unsaved copy is parked in localStorage and offered back on next load.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CURRENCY,
  currentMonthKey,
  getMonth,
  monthIds as listMonthIds,
  monthSummary,
  overspendWarnings,
  savingsOverview,
  withSharedBudget,
} from '@expense/shared';
import { api } from '../lib/api.js';
import { formatMoney } from '../lib/money.js';
import { useAuth } from './AuthContext.jsx';

const SAVE_DELAY = 700;
const parkKey = (userId) => `expense-manager:unsaved:${userId}`;

const StoreContext = createContext(null);

function readParked(userId) {
  try {
    const raw = window.localStorage.getItem(parkKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.store ? parsed : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [store, setStore] = useState(null);
  const [rev, setRev] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // status: idle | saving | saved | offline | conflict | error
  const [save, setSave] = useState({ status: 'idle', at: null, message: null });
  const [parked, setParked] = useState(null);
  const [activeMonthId, setActiveMonthId] = useState(currentMonthKey);
  const [sharedEntries, setSharedEntries] = useState([]);
  const [sharedBudgetError, setSharedBudgetError] = useState('');
  useEffect(() => {
    let generation = 0; let disposed = false;
    setSharedEntries([]);
    const load = async () => {
      const attempt = ++generation;
      if (!userId) return;
      try {
        const result = await api.getSharedSummary();
        if (!disposed && attempt === generation) {
          const seen = new Set();
          const transactions = result.transactions || [];
          const entries = transactions.filter((row) => row.sourceType === 'shared_expense' && (row.amountPaidByCurrentUser || row.personalShare) && !seen.has(row.sourceId) && seen.add(row.sourceId)).map((row) => ({ id: `shared:${row.sourceId}:${userId}`, sourceId: row.sourceId, shared: true, type: 'expense', amount: row.amountPaidByCurrentUser || row.personalShare, date: row.date, currency: row.currency, category: `${row.description || row.category || 'Shared expense'} (shared expense)`, note: row.description }));
          // Settlement credits/debits are applied by ExpensesView's budget
          // summary and breakdown. Keep them out of the projected month here
          // so the same payment is never counted twice.
          setSharedEntries(entries);
          setSharedBudgetError('');
        }
      } catch (error) { if (!disposed && attempt === generation) setSharedBudgetError(error.message); }
    };
    load();
    window.addEventListener('shared-ledger-updated', load); window.addEventListener('focus', load); window.addEventListener('online', load);
    return () => { disposed = true; window.removeEventListener('shared-ledger-updated', load); window.removeEventListener('focus', load); window.removeEventListener('online', load); };
  }, [userId]);

  const storeRef = useRef(null);
  const revRef = useRef(0);
  const timerRef = useRef(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const heldRef = useRef(false); // true after a conflict: stop pushing until resolved
  const offlineRef = useRef(false);

  const park = useCallback((snapshot) => {
    if (!userId) return;
    try {
      window.localStorage.setItem(
        parkKey(userId),
        JSON.stringify({ rev: revRef.current, at: new Date().toISOString(), store: snapshot }),
      );
    } catch { /* private mode or a full quota — the in-memory copy is still fine */ }
  }, [userId]);

  const unpark = useCallback(() => {
    if (!userId) return;
    try { window.localStorage.removeItem(parkKey(userId)); } catch { /* ignore */ }
  }, [userId]);

  /** Write the current document. One save at a time; later edits queue behind it. */
  const persist = useCallback(async () => {
    if (savingRef.current || heldRef.current || !dirtyRef.current || !storeRef.current) return;
    savingRef.current = true;
    dirtyRef.current = false;
    const attempt = storeRef.current;
    setSave({ status: 'saving', at: null, message: null });

    try {
      const saved = await api.saveBudget(attempt, revRef.current);
      revRef.current = saved.rev;
      setRev(saved.rev);
      // Adopt the server's normalised copy only if nothing changed while we waited.
      if (storeRef.current === attempt) {
        storeRef.current = saved.store;
        setStore(saved.store);
      }
      unpark();
      offlineRef.current = false;
      setSave({ status: 'saved', at: saved.updatedAt, message: null });
    } catch (error) {
      dirtyRef.current = true;
      park(attempt);
      offlineRef.current = Boolean(error.offline);
      if (error.offline) {
        setSave({ status: 'offline', at: null, message: 'Offline — your changes are kept here and will sync.' });
      } else if (error.status === 409) {
        heldRef.current = true;
        setSave({ status: 'conflict', at: null, message: error.message });
      } else if (error.status === 401) {
        setSave({ status: 'error', at: null, message: 'Your session expired. Sign in again to save.' });
      } else {
        setSave({ status: 'error', at: null, message: error.message });
      }
    } finally {
      savingRef.current = false;
      // Edits that landed mid-flight go out in a follow-up pass.
      if (dirtyRef.current && !heldRef.current && !offlineRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { persist(); }, SAVE_DELAY);
      }
    }
  }, [park, unpark]);

  const schedule = useCallback((delay = SAVE_DELAY) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { persist(); }, delay);
  }, [persist]);

  /**
   * Run a pure reducer over the document.
   *
   * Accepts both shapes used by `@expense/shared`: a plain store, or a wrapper
   * such as `{ store, transaction }`. The wrapper is returned to the caller so it
   * can read what was created; the store inside it becomes the new state. A
   * reducer that returns the same object means "nothing changed" and saves nothing.
   */
  const apply = useCallback((mutator) => {
    const current = storeRef.current;
    if (!current) return null;
    const result = mutator(current);
    const next = result && typeof result === 'object' && result.store ? result.store : result;
    if (!next || next === current) return result;

    storeRef.current = next;
    setStore(next);
    dirtyRef.current = true;
    schedule();
    return result;
  }, [schedule]);

  const saveNow = useCallback(() => {
    clearTimeout(timerRef.current);
    heldRef.current = false;
    dirtyRef.current = true;
    return persist();
  }, [persist]);

  const reload = useCallback(async () => {
    const doc = await api.getBudget();
    clearTimeout(timerRef.current);
    storeRef.current = doc.store;
    revRef.current = doc.rev;
    dirtyRef.current = false;
    heldRef.current = false;
    offlineRef.current = false;
    setStore(doc.store);
    setRev(doc.rev);
    setSave({ status: 'idle', at: doc.updatedAt, message: null });
    setParked(null);
    unpark();
    return doc;
  }, [unpark]);

  /** Take the parked offline copy and push it over whatever the server holds. */
  const restoreParked = useCallback(async () => {
    const kept = parked;
    if (!kept) return;
    setParked(null);
    storeRef.current = kept.store;
    setStore(kept.store);
    await saveNow();
  }, [parked, saveNow]);

  const discardParked = useCallback(() => {
    setParked(null);
    unpark();
  }, [unpark]);

  const importBackup = useCallback(async (payload) => {
    const doc = await api.importBudget(payload);
    clearTimeout(timerRef.current);
    storeRef.current = doc.store;
    revRef.current = doc.rev;
    dirtyRef.current = false;
    heldRef.current = false;
    setStore(doc.store);
    setRev(doc.rev);
    setSave({ status: 'saved', at: doc.updatedAt, message: null });
    setParked(null);
    unpark();
    setActiveMonthId(listMonthIds(doc.store)[0] || currentMonthKey());
    return doc;
  }, [unpark]);

  // Load the document whenever the signed-in account changes.
  useEffect(() => {
    if (!userId) {
      clearTimeout(timerRef.current);
      storeRef.current = null;
      revRef.current = 0;
      dirtyRef.current = false;
      heldRef.current = false;
      setStore(null);
      setRev(0);
      setParked(null);
      setLoading(false);
      return undefined;
    }

    let live = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    api.getBudget(controller.signal)
      .then((doc) => {
        if (!live) return;
        storeRef.current = doc.store;
        revRef.current = doc.rev;
        setStore(doc.store);
        setRev(doc.rev);
        const ids = listMonthIds(doc.store);
        setActiveMonthId((prev) => (ids.includes(prev) ? prev : ids[0] || currentMonthKey()));
        const kept = readParked(userId);
        // Only offer it back if it was made against this same revision or newer.
        if (kept && Number(kept.rev) >= 0 && JSON.stringify(kept.store) !== JSON.stringify(doc.store)) {
          setParked(kept);
        } else if (kept) {
          unpark();
        }
        setLoading(false);
      })
      .catch((error) => {
        if (!live || error.name === 'AbortError') return;
        setLoadError(error.message);
        setLoading(false);
      });

    return () => { live = false; controller.abort(); };
  }, [userId, unpark]);

  // Push anything outstanding when the tab is hidden or the connection returns,
  // and never leave the page with an edit only in memory.
  useEffect(() => {
    const flush = () => { if (dirtyRef.current) persist(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const onUnload = () => { if (dirtyRef.current && storeRef.current) park(storeRef.current); };
    window.addEventListener('online', flush);
    window.addEventListener('pagehide', onUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('pagehide', onUnload);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [persist, park]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const theme = store?.settings?.theme || 'system';

  // Paint the theme on <html> so Tailwind's `dark:` variant picks it up.
  useEffect(() => {
    const root = document.documentElement;
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const paint = () => {
      const dark = theme === 'dark' || (theme === 'system' && system.matches);
      root.classList.toggle('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
    };
    paint();
    if (theme !== 'system') return undefined;
    system.addEventListener('change', paint);
    return () => system.removeEventListener('change', paint);
  }, [theme]);

  const months = useMemo(() => (store ? listMonthIds(store) : []), [store]);
  const projectedStore = useMemo(() => store ? { ...store, months: store.months.map((month) => withSharedBudget(month, sharedEntries.filter((row) => row.currency === (store.settings.currency || 'INR') && row.date?.startsWith(month.id)))) } : null, [store, sharedEntries]);
  const month = useMemo(() => (projectedStore ? getMonth(projectedStore, activeMonthId) : null), [projectedStore, activeMonthId]);
  const summary = useMemo(() => (month ? monthSummary(month) : null), [month]);
  const warnings = useMemo(() => (month ? overspendWarnings(month) : []), [month]);
  const savings = useMemo(() => (store ? savingsOverview(store.savings) : null), [store]);

  const currency = store?.settings?.currency || DEFAULT_CURRENCY;
  const money = useCallback((value, options) => formatMoney(value, currency, options), [currency]);

  const value = useMemo(() => ({
    store: projectedStore,
    rev,
    loading,
    loadError,
    sharedBudgetError,
    save,
    parked,
    needsSetup: Boolean(store) && !store.settings?.onboardingComplete,
    months,
    month,
    activeMonthId,
    setActiveMonthId,
    summary,
    warnings,
    savings,
    currency,
    money,
    theme,
    apply,
    saveNow,
    reload,
    importBackup,
    restoreParked,
    discardParked,
  }), [
    store, projectedStore, rev, loading, loadError, sharedBudgetError, save, parked, months, month, activeMonthId,
    summary, warnings, savings, currency, money, theme, apply, saveNow, reload,
    importBackup, restoreParked, discardParked,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used inside <StoreProvider>');
  return context;
}
