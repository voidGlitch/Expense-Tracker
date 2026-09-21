/** A settle-all batch is one durable document. Its scope legs are read projections. */
export function inSettlementScope(row, contextType, contextId) {
  if (!row.allocations?.length) return row.contextType === contextType && row.contextId === contextId ? [row] : [];
  return row.allocations.filter((part) => part.contextType === contextType && part.contextId === contextId).map((part, index) => ({
    ...row, ...part, id: `${row.id}:${contextType}:${contextId}:${index}`, batchId: row.id, cashAmount: row.amount, cashFromUserId: row.fromUserId, cashToUserId: row.toUserId, allocations: [],
  }));
}
