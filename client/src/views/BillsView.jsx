/**
 * Enhanced BillsView: Bill definitions management with improved tabs,
 * informative visual cards, and clear schedule previews
 */
import { useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2, CheckCircle2, PauseCircle, PlayCircle, Calendar } from 'lucide-react';
import {
  deleteBillDefinition,
  formatMonthLabel,
  setBillDefinitionActive,
  upcomingDueMonths,
  upsertBillDefinition,
  validateBillDefinition,
} from '@expense/shared';
import { useStore } from '../state/StoreContext.jsx';
import { BillFormModal } from '../components/BillForm.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import {
  Badge, Button, Card, CardHeader, EmptyState, Stat,
} from '../components/ui.jsx';

export default function BillsView() {
  const { store, apply, money } = useStore();
  const definitions = store?.billDefinitions || [];
  const [editing, setEditing] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [confirming, setConfirming] = useState(null);

  const filtered = useMemo(() => {
    if (activeTab === 'active') return definitions.filter((d) => d.active);
    if (activeTab === 'inactive') return definitions.filter((d) => !d.active);
    return definitions;
  }, [definitions, activeTab]);

  // Precompute upcoming months for each definition (next 4) for preview
  const previews = useMemo(() => {
    const map = new Map();
    for (const def of definitions) {
      if (!def.anchorMonth) continue; // skip definitions without anchor
      const months = upcomingDueMonths(def, def.anchorMonth, 4);
      map.set(def.id, months);
    }
    return map;
  }, [definitions]);

  function handleSave(def) {
    const errors = validateBillDefinition(def);
    if (Object.keys(errors).length > 0) {
      alert('Invalid bill definition: ' + Object.values(errors).join(', '));
      return;
    }
    apply((store) => upsertBillDefinition(store, def));
    if (editing?.id) setEditing(null);
  }

  function handleDelete(id) {
    setConfirming(id);
  }

  function handleConfirmDelete() {
    if (confirming) {
      apply((store) => deleteBillDefinition(store, confirming));
      setConfirming(null);
    }
  }

  function handleToggleActive(id) {
    const def = definitions.find((d) => d.id === id);
    if (def) {
      apply((store) => setBillDefinitionActive(store, id, !def.active));
    }
  }

  if (!store) {
    return (
      <Card variant="subtle" className="p-8">
        <EmptyState icon={CalendarClock} title="Data not loaded">
          Unable to load bill definitions.
        </EmptyState>
      </Card>
    );
  }

  const activeCount = definitions.filter((d) => d.active).length;
  const pausedCount = definitions.length - activeCount;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Recurring Bills</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Configure your automated monthly commitments and schedules</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing({ id: null, draft: {} })}>
          Add New Bill
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Defined</span>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tnum">{definitions.length}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Recurring bill rules</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active</span>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tnum">{activeCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Currently generating monthly bills</p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Paused</span>
          <p className="mt-2 text-2xl font-bold text-slate-600 dark:text-slate-400 tnum">{pausedCount}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Temporarily inactive</p>
        </div>
      </div>

      {/* Main Definitions List Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-slate-800 p-3 bg-slate-50/50 dark:bg-slate-900/50">
          {[
            { id: 'all', label: `All (${definitions.length})` },
            { id: 'active', label: `Active (${activeCount})` },
            { id: 'inactive', label: `Paused (${pausedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content list */}
        {filtered.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={CalendarClock} title="No bill definitions found">
              {activeTab !== 'all'
                ? 'No bills found in this status.'
                : 'Add your recurring bills once and they will automatically populate your monthly budget.'}
            </EmptyState>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filtered.map((def) => (
              <div key={def.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`flex items-center justify-center size-10 rounded-xl flex-shrink-0 mt-0.5 ${
                    def.active
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}>
                    <Calendar size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {def.name}
                      </h3>
                      <Badge variant={def.active ? 'success' : 'neutral'} size="sm">
                        {def.active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {def.amountType === 'fixed' ? money(def.amount) : 'Variable amount'}
                      </span>
                      <span>•</span>
                      <span>
                        {def.frequency === 'monthly'
                          ? 'Monthly'
                          : def.frequency === 'quarterly'
                            ? 'Quarterly'
                            : def.frequency === 'oneTime'
                              ? 'One-time'
                              : `Every ${def.intervalMonths} months`}
                      </span>
                      <span>•</span>
                      <span>Due on day {def.dueDay}</span>
                      <span>•</span>
                      <span className="capitalize">{def.paymentMode}</span>
                    </div>

                    {previews.get(def.id) && previews.get(def.id).length > 0 && (
                      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        Upcoming: {previews.get(def.id).map((m) => formatMonthLabel(m)).join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(def.id)}
                    className="text-xs"
                  >
                    {def.active ? 'Pause' : 'Activate'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Pencil}
                    onClick={() => setEditing({ id: def.id, draft: def })}
                    aria-label="Edit definition"
                    className="size-8 p-0"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => handleDelete(def.id)}
                    aria-label="Delete definition"
                    className="size-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {editing && (
        <BillFormModal
          open={true}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          initialExpense={editing.id ? definitions.find((d) => d.id === editing.id) : undefined}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={handleConfirmDelete}
        title="Delete bill definition?"
        variant="danger"
        confirmLabel="Delete"
      >
        This cannot be undone. Any future bills generated from this definition will no longer appear in your budget.
      </ConfirmDialog>
    </div>
  );
}
