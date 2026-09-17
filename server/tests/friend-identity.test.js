import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeContact } from '@expense/shared';
import { createApp } from '../src/app.js';
import { createMemoryRepo } from '../src/storage/memoryStore.js';
import { createMongoRepo } from '../src/storage/mongoStore.js';
import { config } from '../src/env.js';

for (const driver of ['memory', 'mongo']) {
  // A configured Mongo URI enables the live database integration cases.
  describe.skipIf(driver === 'mongo' && !config.mongoUri)(`friend identity (${driver})`, { timeout: 20000 }, () => {
    let repo, app;
    beforeAll(async () => {
      repo = driver === 'memory'
        ? await createMemoryRepo().init()
        : await createMongoRepo(config.mongoUri || 'mongodb://127.0.0.1:27017', `friend_identity_test_${Date.now()}`).init();
      app = createApp(repo);
    }, 15000);
    afterAll(async () => { await repo?.close?.(); });

    async function account(label) {
      const agent = request.agent(app);
      const email = `${label}-${crypto.randomUUID()}@example.com`;
      const response = await agent.post('/api/auth/register').send({ name: label, email, password: 'friendtest123' });
      expect(response.status).toBe(201);
      return { agent, user: response.body.user, email };
    }
    async function expense(owner, otherId, friendshipId, amount = 1000, paidBy = owner.user.id) {
      const response = await owner.agent.post('/api/expenses').send({ description: 'Identity test dinner', amount, paidBy,
        participants: [owner.user.id, otherId], splitMethod: 'equal', contextType: 'friendship', contextId: friendshipId });
      expect(response.status).toBe(201);
      return response.body.expense;
    }
    async function oneFriend(person, otherId) {
      const response = await person.agent.get('/api/friends');
      expect(response.status).toBe(200);
      expect(response.body.contacts).toHaveLength(0);
      expect(response.body.friends).toHaveLength(1);
      expect(response.body.friends[0].user.id).toBe(otherId);
      return response.body.friends[0];
    }

    it('adds an existing account repeatedly in both directions without a guest, and shares expenses', async () => {
      const alice = await account('existing-alice');
      const bob = await account('existing-bob');
      for (const [owner, other] of [[alice, bob], [alice, bob], [bob, alice]]) {
        const added = await owner.agent.post('/api/friends/contacts').send({ name: 'Local nickname', email: ` ${other.email.toUpperCase()} ` });
        expect(added.status).toBe(201);
        expect(added.body.user.id).toBe(other.user.id);
        expect(await repo.listContacts(owner.user.id)).toHaveLength(0);
      }
      const retries = await Promise.all([1, 2].map(() => alice.agent.post('/api/friends/contacts').send({ name: 'Bob again', email: bob.email })));
      expect(retries.map((result) => result.status)).toEqual([201, 201]);
      const friendship = await oneFriend(alice, bob.user.id);
      expect((await oneFriend(bob, alice.user.id)).id).toBe(friendship.id);
      await expense(alice, bob.user.id, friendship.id);
      await expense(bob, alice.user.id, friendship.id, 400);
      expect((await alice.agent.get(`/api/friendships/${friendship.id}/expenses`)).body.expenses).toHaveLength(2);
      expect((await bob.agent.get(`/api/friendships/${friendship.id}/balance`)).body.balances.INR).toMatchObject({ direction: 'youOwe', amount: 300 });
      expect((await alice.agent.get('/api/shared/summary')).body.totals.INR.personalExpense).toBe(700);
      expect((await bob.agent.get('/api/shared/summary')).body.totals.INR.personalExpense).toBe(700);
    });

    it('reuses an unregistered guest and preserves their expense when they register', async () => {
      const alice = await account('guest-alice');
      const email = `future-${crypto.randomUUID()}@example.com`;
      const body = { name: 'Future Bob', email };
      const first = await alice.agent.post('/api/friends/contacts').send(body);
      const repeated = await alice.agent.post('/api/friends/contacts').send(body);
      expect(repeated.status).toBe(201);
      expect(repeated.body.contact.id).toBe(first.body.contact.id);
      const guest = await oneFriend(alice, first.body.contact.participantId);
      const saved = await expense(alice, guest.user.id, guest.id);
      const agent = request.agent(app);
      const registered = await agent.post('/api/auth/register').send({ name: 'Registered Bob', email, password: 'friendtest123' });
      expect(registered.status).toBe(201);
      const bob = { agent, user: registered.body.user };
      expect((await oneFriend(alice, bob.user.id)).id).toBe(guest.id);
      await oneFriend(bob, alice.user.id);
      const ledger = await bob.agent.get(`/api/friendships/${guest.id}/expenses`);
      expect(ledger.body.expenses).toHaveLength(1);
      expect(ledger.body.expenses[0].id).toBe(saved.id);
      expect(ledger.body.expenses[0].participants).toContain(bob.user.id);
    });

    it('merges a legacy guest into an existing friendship without losing expenses or settlements', async () => {
      const alice = await account('legacy-alice');
      const bob = await account('legacy-bob');
      const main = await repo.createFriendship(alice.user.id, bob.user.id);
      await expense(alice, bob.user.id, main.id, 200);
      const contact = await repo.createContact(makeContact({ ownerUserId: alice.user.id, name: 'Guest duplicate', email: bob.email }));
      const guestFriendship = await repo.findFriendshipBetween(alice.user.id, contact.participantId);
      await expense(alice, contact.participantId, guestFriendship.id, 1000, contact.participantId);
      const settlement = await alice.agent.post('/api/settlements').send({ contextType: 'friendship', contextId: guestFriendship.id,
        fromUserId: alice.user.id, toUserId: contact.participantId, amount: 100, method: 'cash', date: '2026-09-17' });
      expect(settlement.status).toBe(201);
      const repaired = await alice.agent.post('/api/friends/contacts').send({ name: 'Bob', email: bob.email });
      expect(repaired.status).toBe(201);
      expect((await oneFriend(alice, bob.user.id)).id).toBe(main.id);
      await oneFriend(bob, alice.user.id);
      expect((await alice.agent.get(`/api/friendships/${main.id}/expenses`)).body.expenses).toHaveLength(2);
      expect((await alice.agent.get(`/api/friendships/${main.id}/balance`)).body.balances.INR).toMatchObject({ direction: 'youOwe', amount: 300 });
      expect(await repo.findFriendshipById(guestFriendship.id)).toBeNull();
    });

    it('rejects self and malformed email and keeps same-name accounts distinct', async () => {
      const alice = await account('same-name');
      const bob = await account('same-name');
      for (const email of [alice.email, 'invalid-email']) {
        expect((await alice.agent.post('/api/friends/contacts').send({ name: 'Someone', email })).status).toBe(400);
      }
      expect((await alice.agent.post('/api/friends/contacts').send({ name: 'same-name', email: bob.email })).status).toBe(201);
      await oneFriend(alice, bob.user.id);
    });

    it('resolves a registered group member without creating a duplicate guest friendship', async () => {
      const alice = await account('group-alice');
      const bob = await account('group-bob');
      await alice.agent.post('/api/friends/contacts').send({ name: 'Bob', email: bob.email });
      const created = await alice.agent.post('/api/groups').send({ name: 'Identity trip', memberIds: [] });
      expect(created.status).toBe(201);
      const added = await alice.agent.post(`/api/groups/${created.body.group.id}/members`).send({ name: 'Bob guest alias', email: bob.email });
      expect(added.status).toBe(201);
      expect(added.body.group.members).toHaveLength(2);
      await oneFriend(alice, bob.user.id);
      expect(await repo.listContacts(alice.user.id)).toHaveLength(0);
    });
  });
}
