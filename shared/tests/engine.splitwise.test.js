import { describe, expect, it } from 'vitest';
import {
  calculateSplits,
  calculateNetBalances,
  simplifyDebts,
  calculatePairwiseBalances,
  getSplitwiseSummary,
} from '../src/engine/splitwise.js';

describe('Splitwise calculation engine', () => {
  describe('calculateSplits', () => {
    it('splits equally with exact cents handling', () => {
      const splits = calculateSplits(100, 'equal', ['u1', 'u2', 'u3']);
      expect(splits).toHaveLength(3);
      const sum = splits.reduce((acc, s) => acc + s.amount, 0);
      expect(sum).toBe(100);
      expect(splits[0].amount).toBe(33.34);
      expect(splits[1].amount).toBe(33.33);
      expect(splits[2].amount).toBe(33.33);
    });

    it('splits with exact amounts', () => {
      const splits = calculateSplits(150, 'exact', ['u1', 'u2'], { u1: 100, u2: 50 });
      expect(splits[0].amount).toBe(100);
      expect(splits[1].amount).toBe(50);
    });

    it('splits by percentage', () => {
      const splits = calculateSplits(200, 'percentage', ['u1', 'u2'], { u1: 60, u2: 40 });
      expect(splits[0].amount).toBe(120);
      expect(splits[1].amount).toBe(80);
    });

    it('splits by shares', () => {
      const splits = calculateSplits(300, 'shares', ['u1', 'u2', 'u3'], { u1: 2, u2: 1, u3: 3 });
      expect(splits[0].amount).toBe(100);
      expect(splits[1].amount).toBe(50);
      expect(splits[2].amount).toBe(150);
    });
  });

  describe('calculateNetBalances & simplifyDebts', () => {
    it('calculates net balances for simple expense', () => {
      const expenses = [
        {
          id: 'exp_1',
          paidBy: 'u1',
          amount: 90,
          splits: [
            { memberId: 'u1', amount: 30 },
            { memberId: 'u2', amount: 30 },
            { memberId: 'u3', amount: 30 },
          ],
        },
      ];

      const balances = calculateNetBalances(expenses, []);
      expect(balances.u1).toBe(60); // Paid 90, consumed 30 -> +60
      expect(balances.u2).toBe(-30);
      expect(balances.u3).toBe(-30);
    });

    it('simplifies debts correctly across multiple participants', () => {
      // Alice paid 60 for Bob, Bob paid 60 for Charlie
      // Net: Alice +60, Charlie -60, Bob 0
      // Simplified: Charlie pays Alice 60
      const netBalances = {
        Alice: 60,
        Bob: 0,
        Charlie: -60,
      };

      const transactions = simplifyDebts(netBalances);
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toEqual({
        from: 'Charlie',
        to: 'Alice',
        fromName: 'Charlie',
        toName: 'Alice',
        amount: 60,
      });
    });

    it('handles settlements and updates summary', () => {
      const expenses = [
        {
          id: 'exp_1',
          paidBy: 'u1',
          amount: 100,
          splits: [
            { memberId: 'u1', amount: 50 },
            { memberId: 'u2', amount: 50 },
          ],
        },
      ];
      const settlements = [
        {
          id: 'set_1',
          from: 'u2',
          to: 'u1',
          amount: 50,
        },
      ];

      const balances = calculateNetBalances(expenses, settlements);
      expect(balances.u1).toBe(0);
      expect(balances.u2).toBe(0);

      const summary = getSplitwiseSummary('u1', [{ id: 'g1' }], expenses, settlements);
      expect(summary.netBalance).toBe(0);
      expect(summary.totalYouOwe).toBe(0);
      expect(summary.totalYouAreOwed).toBe(0);
    });
  });
});
