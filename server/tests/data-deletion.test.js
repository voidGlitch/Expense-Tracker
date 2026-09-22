import { describe, expect, it } from 'vitest';
import { createMemoryRepo } from '../src/storage/memoryStore.js';

describe('permanent data deletion', () => {
  it('purges an expense and its refund/recurring children', async () => {
    const repo = await createMemoryRepo().init();
    await repo.createExpense({ id: 'exp-1', contextType: 'friendship', contextId: 'f-1', createdBy: 'u-1', paidBy: 'u-1', participants: ['u-1'], amount: 10, date: '2026-09-01' });
    await repo.createExpense({ id: 'refund-1', refundOf: 'exp-1', contextType: 'friendship', contextId: 'f-1', createdBy: 'u-1', paidBy: 'u-1', participants: ['u-1'], amount: 2, date: '2026-09-02' });
    await repo.createExpense({ id: 'occ-1', recurringSourceId: 'exp-1', contextType: 'friendship', contextId: 'f-1', createdBy: 'u-1', paidBy: 'u-1', participants: ['u-1'], amount: 10, date: '2026-10-01' });
    expect(await repo.purgeExpense('exp-1')).toBe(true);
    expect(await repo.findExpenseById('exp-1')).toBeNull();
    expect(await repo.findExpenseById('refund-1')).toBeNull();
    expect(await repo.findExpenseById('occ-1')).toBeNull();
  });
});
