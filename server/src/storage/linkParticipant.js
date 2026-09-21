import { minor, major } from '@expense/shared';
export function linkExpenseParticipant(expense, guestId, userId) {
  const replace = (id) => id === guestId ? userId : id;
  const merge = (rows = []) => {
    const map = new Map();
    for (const row of rows) { const id = replace(row.memberId); map.set(id, (map.get(id) || 0) + minor(row.amount)); }
    return [...map].map(([memberId, amount]) => ({ memberId, amount: major(amount) }));
  };
  const splitDetails = {};
  for (const [key, value] of Object.entries(expense.splitDetails || {})) {
    if (key === 'items' && Array.isArray(value)) splitDetails.items = value.map((item) => ({ ...item, memberIds: [...new Set(item.memberIds.map(replace))] }));
    else { const id = replace(key); splitDetails[id] = typeof value === 'number' ? (splitDetails[id] || 0) + value : value; }
  }
  return { ...expense, paidBy: replace(expense.paidBy), payers: expense.payers?.length ? merge(expense.payers) : undefined, participants: [...new Set((expense.participants || []).map(replace))], splits: merge(expense.splits), splitDetails, revision: (expense.revision || 1) + 1 };
}
export function linkSettlementParticipant(row, guestId, userId) {
  const replace = (id) => id === guestId ? userId : id;
  return { ...row, fromUserId: replace(row.fromUserId), toUserId: replace(row.toUserId), allocations: (row.allocations || []).map((part) => ({ ...part, fromUserId: replace(part.fromUserId), toUserId: replace(part.toUserId) })), revision: (row.revision || 1) + 1 };
}
