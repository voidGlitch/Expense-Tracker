/**
 * The file driver is the default one users will run, so it gets its own test:
 * data must survive a restart, and a corrupt file must fail loudly.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applySetup, currentMonthKey, emptyStore } from '@expense/shared';
import { createFileRepo } from '../src/storage/fileStore.js';
import { hashPassword } from '../src/auth/password.js';

let dir;
let file;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'em-store-'));
  file = path.join(dir, 'nested', 'db.json');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const read = async () => JSON.parse(await fs.readFile(file, 'utf8'));

describe('file storage driver', () => {
  it('retains friendship expenses and repayments after a restart', async () => {
    const first = await createFileRepo(file).init();
    const alice = await first.createUser({ name: 'Alice', email: 'alice@example.com', passwordHash: 'test' });
    const bob = await first.createUser({ name: 'Bob', email: 'bob@example.com', passwordHash: 'test' });
    const friendship = await first.createFriendship(alice.id, bob.id);
    const context = { contextType: 'friendship', contextId: friendship.id };
    const expense = { ...context, id: 'expense-1', amount: 1000, paidBy: alice.id, participants: [alice.id, bob.id], splits: [{ memberId: alice.id, amount: 500 }, { memberId: bob.id, amount: 500 }] };
    const settlement = { ...context, id: 'settlement-1', amount: 200, fromUserId: bob.id, toUserId: alice.id };
    await first.createExpense(expense);
    await first.createSettlement(settlement);
    await first.close();
    const second = await createFileRepo(file).init();
    expect(await second.listExpenses(context)).toEqual([expense]);
    expect(await second.listSettlements(context)).toEqual([settlement]);
    expect(await second.findFriendshipBetween(alice.id, bob.id)).toMatchObject({ id: friendship.id });
    await second.close();
  });
  it('creates the file (and its folder) on first write', async () => {
    const repo = await createFileRepo(file).init();
    await repo.createUser({ email: 'a@b.co', name: 'A', passwordHash: 'x' });
    await repo.close();

    const saved = await read();
    expect(Object.keys(saved.users)).toHaveLength(1);
    expect(repo.driver).toBe('file');
  });

  it('survives a restart with users and budgets intact', async () => {
    const first = await createFileRepo(file).init();
    const user = await first.createUser({
      email: 'a@b.co', name: 'A', passwordHash: await hashPassword('budget2026'),
    });
    const store = applySetup(emptyStore(), {
      monthId: currentMonthKey(),
      income: 30000,
      billDefinitions: [{
        name: 'Rent', category: 'Housing', amountType: 'fixed', amount: 18000,
        frequency: 'monthly', dueDay: 1, paymentMode: 'scheduled',
      }],
    });
    await first.saveDocument(user.id, store, 1);
    await first.close();

    const second = await createFileRepo(file).init();
    const found = await second.findUserByEmail('a@b.co');
    expect(found.id).toBe(user.id);
    expect(found.passwordHash).toMatch(/^\$2[aby]\$/);

    const document = await second.getDocument(user.id);
    expect(document.rev).toBe(2);
    expect(document.store.billDefinitions[0].name).toBe('Rent');
    expect(document.store.months[0].bills[0].actualAmount).toBe(18000);
    await second.close();
  });

  it('never writes the plain password to disk', async () => {
    const repo = await createFileRepo(file).init();
    await repo.createUser({ email: 'a@b.co', name: 'A', passwordHash: await hashPassword('budget2026') });
    await repo.close();
    expect(await fs.readFile(file, 'utf8')).not.toContain('budget2026');
  });

  it('coalesces a burst of writes and still ends up correct', async () => {
    const repo = await createFileRepo(file).init();
    const user = await repo.createUser({ email: 'a@b.co', name: 'A', passwordHash: 'x' });
    for (let rev = 1; rev <= 6; rev += 1) {
      await repo.saveDocument(user.id, { ...emptyStore(), settings: { salaryDay: rev } }, rev);
    }
    await repo.close();

    const saved = await read();
    expect(saved.documents[user.id].rev).toBe(7);
    expect(saved.documents[user.id].store.settings.salaryDay).toBe(6);
  });

  it('refuses to start on a corrupt file instead of pretending it is empty', async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{ this is not json', 'utf8');
    await expect(createFileRepo(file).init()).rejects.toThrow(/could not parse/i);
  });

  it('treats an empty file as a fresh database', async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '   ', 'utf8');
    const repo = await createFileRepo(file).init();
    expect(await repo.countUsers()).toBe(0);
    await repo.close();
  });
});
