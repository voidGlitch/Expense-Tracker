import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SharedPosition from './SharedPosition.jsx';

afterEach(cleanup);
it('shows each open balance once, with separate directions and currencies', () => {
  render(<SharedPosition shared={{ openPositions: [
    { id: 'one', personName: 'Mike', contextTitle: 'Direct expenses', direction: 'receivable', amount: 350, currency: 'INR' },
    { id: 'two', personName: 'Alice', contextTitle: 'Trip', direction: 'payable', amount: 100, currency: 'USD' },
  ] }} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByText('Mike').closest('li').textContent).toContain('Owes you₹350');
  expect(screen.getByText('Alice').closest('li').textContent).toContain('You owe$100');
  expect(screen.queryByText('All settled up')).toBeNull();
});
it('distinguishes loading and failed requests from a settled ledger', () => {
  const view = render(<SharedPosition shared={null} loading />);
  expect(screen.getByRole('status').textContent).toContain('Loading');
  expect(screen.queryByText('All settled up')).toBeNull();
  view.rerender(<SharedPosition shared={null} error="Offline" />);
  expect(screen.getByText(/Unable to load/)).toBeTruthy();
  expect(screen.queryByText('All settled up')).toBeNull();
  view.rerender(<SharedPosition shared={{ openPositions: [] }} />);
  expect(screen.getByText('All settled up')).toBeTruthy();
  expect(screen.queryByRole('listitem')).toBeNull();
});
