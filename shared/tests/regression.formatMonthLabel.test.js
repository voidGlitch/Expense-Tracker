/**
 * Regression tests for formatMonthLabel type safety
 * Catches bugs where objects or undefined are passed instead of month key strings
 */
import { describe, it, expect } from 'vitest';
import { formatMonthLabel, isMonthKey } from '../src/engine/dates.js';

describe('formatMonthLabel type safety', () => {
  it('accepts valid month key strings', () => {
    expect(formatMonthLabel('2026-09')).toBe('September 2026');
    expect(formatMonthLabel('2025-01')).toBe('January 2025');
    expect(formatMonthLabel('2026-12')).toBe('December 2026');
  });

  it('throws TypeError for undefined input', () => {
    expect(() => formatMonthLabel(undefined)).toThrow(TypeError);
    expect(() => formatMonthLabel(undefined)).toThrow(/Invalid month key/);
  });

  it('throws TypeError for null input', () => {
    expect(() => formatMonthLabel(null)).toThrow(TypeError);
    expect(() => formatMonthLabel(null)).toThrow(/Invalid month key/);
  });

  it('throws TypeError for object input (common bug)', () => {
    const monthObject = { id: '2026-09', label: 'September 2026', status: 'open' };
    expect(() => formatMonthLabel(monthObject)).toThrow(TypeError);
    expect(() => formatMonthLabel(monthObject)).toThrow(/Invalid month key/);
  });

  it('throws TypeError for empty object', () => {
    expect(() => formatMonthLabel({})).toThrow(TypeError);
  });

  it('throws TypeError for number input', () => {
    expect(() => formatMonthLabel(202609)).toThrow(TypeError);
  });

  it('throws TypeError for malformed strings', () => {
    expect(() => formatMonthLabel('2026-9')).toThrow(TypeError); // missing leading zero
    expect(() => formatMonthLabel('2026/09')).toThrow(TypeError); // wrong separator
    expect(() => formatMonthLabel('09-2026')).toThrow(TypeError); // wrong order
    expect(() => formatMonthLabel('September 2026')).toThrow(TypeError); // label format
  });
});

describe('isMonthKey validator', () => {
  it('returns true for valid month keys', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2025-01')).toBe(true);
    expect(isMonthKey('2026-12')).toBe(true);
  });

  it('returns false for invalid inputs', () => {
    expect(isMonthKey(undefined)).toBe(false);
    expect(isMonthKey(null)).toBe(false);
    expect(isMonthKey({ id: '2026-09' })).toBe(false);
    expect(isMonthKey('2026-9')).toBe(false);
    expect(isMonthKey('')).toBe(false);
  });
});
