import { describe, expect, it } from 'vitest';
import {
  addMonths, compareMonthKeys, dayOfMonth, daysInMonth, dueDateISO, formatDayLabel,
  formatMonthLabel, isDayKey, isMonthKey, monthKeyOf, monthRange, monthsBetween,
  parseMonthKey, toMonthKey, todayKey,
} from '../src/engine/dates.js';

describe('month key parsing', () => {
  it('accepts valid keys and rejects everything else', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-00')).toBe(false);
    expect(isMonthKey('2026-9')).toBe(false);
    expect(isMonthKey('2026-09-01')).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });

  it('parses and rebuilds', () => {
    expect(parseMonthKey('2026-09')).toEqual({ year: 2026, month: 9 });
    expect(() => parseMonthKey('nope')).toThrow(TypeError);
    expect(toMonthKey(2026, 9)).toBe('2026-09');
  });

  it('normalises month overflow and underflow', () => {
    expect(toMonthKey(2026, 13)).toBe('2027-01');
    expect(toMonthKey(2026, 0)).toBe('2025-12');
    expect(toMonthKey(2026, 25)).toBe('2028-01');
  });
});

describe('month arithmetic', () => {
  it('is signed and crosses years', () => {
    expect(monthsBetween('2026-09', '2026-12')).toBe(3);
    expect(monthsBetween('2026-09', '2027-03')).toBe(6);
    expect(monthsBetween('2026-09', '2026-08')).toBe(-1);
    expect(monthsBetween('2026-09', '2026-09')).toBe(0);
    expect(monthsBetween('2025-12', '2026-01')).toBe(1);
  });

  it('addMonths is the inverse', () => {
    expect(addMonths('2026-09', 3)).toBe('2026-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-09', 0)).toBe('2026-09');
  });

  it('sorts as plain strings', () => {
    expect(compareMonthKeys('2026-09', '2026-10')).toBe(-1);
    expect(compareMonthKeys('2027-01', '2026-12')).toBe(1);
    expect(['2027-01', '2026-09', '2026-12'].sort(compareMonthKeys)).toEqual(['2026-09', '2026-12', '2027-01']);
  });

  it('builds inclusive ranges', () => {
    expect(monthRange('2026-09', '2026-12')).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
    expect(monthRange('2026-09', '2026-09')).toEqual(['2026-09']);
    expect(monthRange('2026-12', '2026-09')).toEqual([]);
  });
});

describe('day counts and due dates', () => {
  it('knows month lengths, leap years included', () => {
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2000-02')).toBe(29);
    expect(daysInMonth('1900-02')).toBe(28);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('clamps due days into the month', () => {
    expect(dueDateISO('2026-09', 1)).toBe('2026-09-01');
    expect(dueDateISO('2026-09', 31)).toBe('2026-09-30');
    expect(dueDateISO('2027-02', 30)).toBe('2027-02-28');
    expect(dueDateISO('2026-09', 0)).toBe('2026-09-01');
    expect(dueDateISO('2026-09', undefined)).toBe('2026-09-01');
  });

  it('derives month keys from days and Dates', () => {
    expect(monthKeyOf('2026-09-04')).toBe('2026-09');
    expect(monthKeyOf('2026-09')).toBe('2026-09');
    expect(monthKeyOf(new Date(2026, 8, 4))).toBe('2026-09');
    expect(() => monthKeyOf('rubbish')).toThrow(TypeError);
    expect(dayOfMonth('2026-09-04')).toBe(4);
    expect(isDayKey('2026-09-31')).toBe(true);
    expect(isDayKey('2026-09-32')).toBe(false);
  });

  it('todayKey uses local time, not UTC', () => {
    // 31 Dec 23:00 local must not roll over to 1 Jan.
    expect(todayKey(new Date(2026, 11, 31, 23, 0, 0))).toBe('2026-12-31');
    expect(todayKey(new Date(2026, 0, 1, 0, 30, 0))).toBe('2026-01-01');
  });
});

describe('labels', () => {
  it('formats for humans', () => {
    expect(formatMonthLabel('2026-09')).toBe('September 2026');
    expect(formatMonthLabel('2027-01')).toBe('January 2027');
    expect(formatDayLabel('2026-09-04')).toBe('4 Sep 2026');
  });
});
