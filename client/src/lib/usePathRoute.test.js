/**
 * Path routing tests — ensures navigation uses clean URLs (/expenses not /#/expenses)
 * and handles backward compatibility with old hash routes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePathRoute } from './usePathRoute.js';

describe('usePathRoute', () => {
  beforeEach(() => {
    // Reset to root path before each test
    window.history.replaceState(null, '', '/');
  });

  it('defaults to dashboard on /', () => {
    const { result } = renderHook(() => usePathRoute());
    expect(result.current[0]).toBe('dashboard');
  });

  it('reads route from pathname', () => {
    window.history.replaceState(null, '', '/expenses');
    const { result } = renderHook(() => usePathRoute());
    expect(result.current[0]).toBe('expenses');
  });

  it('navigates to a new path using clean URL', () => {
    const { result } = renderHook(() => usePathRoute());

    act(() => {
      result.current[1]('bills');
    });

    expect(window.location.pathname).toBe('/bills');
    expect(result.current[0]).toBe('bills');
  });

  it('navigates to dashboard with /', () => {
    window.history.replaceState(null, '', '/bills');
    const { result } = renderHook(() => usePathRoute());

    act(() => {
      result.current[1]('dashboard');
    });

    expect(window.location.pathname).toBe('/');
    expect(result.current[0]).toBe('dashboard');
  });

  it('does not navigate if already on target route', () => {
    window.history.replaceState(null, '', '/expenses');
    const { result } = renderHook(() => usePathRoute());

    const beforePath = window.location.pathname;
    act(() => {
      result.current[1]('expenses');
    });

    expect(window.location.pathname).toBe(beforePath);
  });

  it('responds to popstate events (back button)', () => {
    window.history.replaceState(null, '', '/expenses');
    const { result } = renderHook(() => usePathRoute());

    act(() => {
      window.history.pushState(null, '', '/savings');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current[0]).toBe('savings');
  });

  it('handles all valid routes', () => {
    const routes = ['dashboard', 'expenses', 'bills', 'savings', 'history', 'settings'];

    routes.forEach((route) => {
      const path = route === 'dashboard' ? '/' : `/${route}`;
      window.history.replaceState(null, '', path);
      const { result } = renderHook(() => usePathRoute());
      expect(result.current[0]).toBe(route);
    });
  });

  it('ignores invalid routes and defaults to dashboard', () => {
    window.history.replaceState(null, '', '/invalid-route');
    const { result } = renderHook(() => usePathRoute());
    expect(result.current[0]).toBe('dashboard');
  });

  it('prevents disruption when clicking navigation while already on the route', () => {
    window.history.replaceState(null, '', '/bills');
    const { result } = renderHook(() => usePathRoute());

    expect(result.current[0]).toBe('bills');

    // Click bills again — should stay on /bills, not disrupt flow
    act(() => {
      result.current[1]('bills');
    });

    expect(window.location.pathname).toBe('/bills');
    expect(result.current[0]).toBe('bills');
  });

  it('migrates old hash routes to clean paths on mount', () => {
    // Simulate old bookmark: http://localhost:5173/#/expenses
    window.history.replaceState(null, '', '/#/expenses');
    const { result } = renderHook(() => usePathRoute());

    // After mount, hash should be gone and pathname should be /expenses
    expect(window.location.pathname).toBe('/expenses');
    expect(window.location.hash).toBe('');
    expect(result.current[0]).toBe('expenses');
  });

  it('migrates hash route with #/bills to /bills', () => {
    window.history.replaceState(null, '', '/#/bills');
    const { result } = renderHook(() => usePathRoute());

    expect(window.location.pathname).toBe('/bills');
    expect(window.location.hash).toBe('');
    expect(result.current[0]).toBe('bills');
  });
});
