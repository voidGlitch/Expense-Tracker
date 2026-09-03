/**
 * Enhanced SettingsView: Profile, preferences, currency, theme,
 * backup/restore, and PWA installation
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download, Moon, Palette, Settings, Sun, Upload, User, Shield, Smartphone, HardDrive
} from 'lucide-react';
import { CURRENCIES, updateSettings } from '@expense/shared';
import { useAuth } from '../state/AuthContext.jsx';
import { useStore } from '../state/StoreContext.jsx';
import { api } from '../lib/api.js';
import { canInstall, onInstallAvailable, promptInstall, isStandalone } from '../lib/pwa.js';
import {
  Button, Card, CardHeader, Field, Select, TextInput, Toggle,
} from '../components/ui.jsx';

export default function SettingsView() {
  const { user, signOut } = useAuth();
  const { store, apply, importBackup, currency } = useStore();
  const settings = store?.settings || {};

  const [name, setName] = useState(user?.name || '');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState(null);

  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [installable, setInstallable] = useState(canInstall());
  const fileRef = useRef(null);

  useEffect(() => onInstallAvailable(setInstallable), []);

  // Theme
  const theme = settings.theme || 'system';
  const setTheme = (value) => apply((s) => updateSettings(s, { theme: value }));

  // Currency
  const setCurrency = (value) => apply((s) => updateSettings(s, { currency: value }));

  // Salary Day
  const setSalaryDay = (value) => {
    const day = Math.max(1, Math.min(28, Number(value) || 1));
    apply((s) => updateSettings(s, { salaryDay: day }));
  };

  // Rename
  const handleRename = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setRenaming(true);
    setRenameError(null);
    try {
      await api.rename(trimmed);
    } catch (err) {
      setRenameError(err.message);
    } finally {
      setRenaming(false);
    }
  }, [name]);

  // JSON Export
  const handleExportJson = useCallback(async () => {
    try {
      await api.downloadJson();
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  }, []);

  // JSON Import
  const handleImport = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await importBackup(payload);
    } catch (err) {
      setImportError(err.message || 'Import failed.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [importBackup]);

  // Install PWA
  const handleInstall = useCallback(async () => {
    await promptInstall();
  }, []);

  if (!store) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Manage account information, preferences, and data backups</p>
      </div>

      {/* Profile */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center size-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
            <User size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Profile & Account</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Personal details and session credentials</p>
          </div>
        </div>

        <div className="space-y-4 max-w-lg">
          <Field label="Display Name" htmlFor="settings-name">
            <div className="flex gap-2">
              <TextInput
                id="settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="h-10"
              />
              <Button
                variant="primary"
                onClick={handleRename}
                busy={renaming}
                disabled={!name.trim() || name.trim() === user?.name}
                className="h-10"
              >
                Save
              </Button>
            </div>
            {renameError && <p className="mt-1 text-xs text-rose-600">{renameError}</p>}
          </Field>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Logged in as <strong className="text-slate-800 dark:text-slate-200 font-semibold">{user?.email}</strong>
          </div>

          <div className="pt-2">
            <Button variant="ghost" onClick={signOut} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30">
              Sign out of account
            </Button>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center size-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
            <Palette size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Preferences & Format</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Currency, monthly calculation anchor, and appearance</p>
          </div>
        </div>

        <div className="space-y-5 max-w-lg">
          <Field label="Currency" htmlFor="settings-currency">
            <Select
              id="settings-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-10 bg-white dark:bg-slate-950"
            >
              {Object.entries(CURRENCIES).map(([code, meta]) => (
                <option key={code} value={code}>{meta.symbol} {code} — {meta.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Salary Arrival Day" htmlFor="settings-salary-day" hint="Day 1–28 of the month. Used as anchor for monthly cycles.">
            <TextInput
              id="settings-salary-day"
              type="number"
              min={1}
              max={28}
              inputMode="numeric"
              value={settings.salaryDay ?? 1}
              onChange={(e) => setSalaryDay(e.target.value)}
              className="h-10"
            />
          </Field>

          <Field label="Theme Appearance">
            <div className="flex items-center gap-2">
              {[
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'system', label: 'System', icon: Smartphone },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    theme === t.id
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <t.icon size={14} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      {/* Data Management */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center size-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
            <HardDrive size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Backup & Storage</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Download a complete JSON snapshot or restore from a previous file</p>
          </div>
        </div>

        <div className="space-y-4 max-w-lg">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" icon={Download} onClick={handleExportJson} className="h-10">
              Export JSON Backup
            </Button>

            <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()} busy={importing} className="h-10">
              Import JSON Backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImport}
              className="hidden"
              aria-label="Import backup file"
            />
          </div>

          {importError && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{importError}</p>}
        </div>
      </div>

      {/* Install PWA */}
      {!isStandalone() && installable && (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 p-6 text-white shadow-lg shadow-indigo-500/20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold">Install as Desktop / Mobile App</h3>
              <p className="text-xs text-indigo-100 mt-1">Pin Expense Manager to your dock or home screen for faster offline access</p>
            </div>
            <Button
              variant="secondary"
              onClick={handleInstall}
              className="bg-white text-indigo-900 hover:bg-indigo-50 border-0 shadow-md"
            >
              Install App
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
