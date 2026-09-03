/**
 * Integration tests for HistoryView and BillsView formatMonthLabel usage
 * Regression coverage for bugs where API responses or computed values were passed
 * directly to formatMonthLabel without extracting the string month key
 */
import { describe, it, expect } from 'vitest';
import { upcomingDueMonths } from '../src/engine/bills.js';
import { formatMonthLabel } from '../src/engine/dates.js';

describe('upcomingDueMonths return type', () => {
  it('returns an array of month key strings, not objects', () => {
    const def = {
      id: 'electric',
      name: 'Electricity',
      anchorMonth: '2026-09',
      frequency: 'monthly',
      dueDay: 5,
      amount: 1500,
      amountType: 'variable',
      paymentMode: 'manual',
      active: true,
    };

    const result = upcomingDueMonths(def, '2026-09', 3);

    // Should return an array of strings
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);

    // Each item should be a valid month key string
    result.forEach((monthKey) => {
      expect(typeof monthKey).toBe('string');
      expect(monthKey).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    });

    // Should be usable directly with formatMonthLabel
    expect(() => result.map((m) => formatMonthLabel(m))).not.toThrow();
    expect(result.map((m) => formatMonthLabel(m))).toEqual([
      'September 2026',
      'October 2026',
      'November 2026',
    ]);
  });

  it('returns empty array when anchorMonth is undefined', () => {
    const def = {
      id: 'test',
      name: 'Test',
      anchorMonth: undefined, // Bug scenario: definition without anchor
      frequency: 'monthly',
      dueDay: 5,
      amount: 1000,
      amountType: 'fixed',
      paymentMode: 'manual',
      active: true,
    };

    // Should not crash and should return empty array
    const result = upcomingDueMonths(def, '2026-09', 3);
    expect(result).toEqual([]);
  });

  it('handles quarterly frequency correctly', () => {
    const def = {
      id: 'insurance',
      name: 'Insurance',
      anchorMonth: '2026-01',
      frequency: 'quarterly',
      dueDay: 15,
      amount: 5000,
      amountType: 'fixed',
      paymentMode: 'scheduled',
      active: true,
    };

    const result = upcomingDueMonths(def, '2026-01', 4);

    expect(result).toEqual(['2026-01', '2026-04', '2026-07', '2026-10']);
    expect(() => result.map((m) => formatMonthLabel(m))).not.toThrow();
  });
});

describe('API export months response shape', () => {
  it('documents the expected server response format', () => {
    // This is what the server returns from GET /api/export/months
    const serverResponse = {
      months: [
        { id: '2026-09', label: 'September 2026', status: 'open', transactions: 3, bills: 2 },
        { id: '2026-08', label: 'August 2026', status: 'closed', transactions: 5, bills: 3 },
      ],
    };

    // Client must extract .id before passing to formatMonthLabel
    serverResponse.months.forEach((m) => {
      expect(typeof m.id).toBe('string');
      expect(() => formatMonthLabel(m.id)).not.toThrow();

      // Passing the whole object should fail
      expect(() => formatMonthLabel(m)).toThrow(TypeError);
    });

    // Correct usage pattern
    const monthOptions = serverResponse.months.map((m) => ({
      value: m.id,
      label: m.label || formatMonthLabel(m.id),
    }));

    expect(monthOptions[0]).toEqual({
      value: '2026-09',
      label: 'September 2026',
    });
  });
});
