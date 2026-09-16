/** Phase 1: real accounts, friendships, groups, and server-side authorization. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const password = 'splitwise1';

async function account(app, name, email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({ name, email, password });
  if (response.status !== 201) throw new Error(JSON.stringify(response.body));
  return { agent, user: response.body.user };
}

async function acceptedFriendship(app) {
  const alice = await account(app, 'Alice', 'alice@example.com');
  const bob = await account(app, 'Bob', 'bob@example.com');
  const asked = await alice.agent.post('/api/friends/request').send({ userId: bob.user.id, message: 'Trip?' });
  const accepted = await bob.agent.post(`/api/friends/${asked.body.request.id}/accept`).send({});
  return { alice, bob, friendship: accepted.body.friendship };
}

describe('shared-expense Phase 1 API', () => {
  it('finds users without returning the current account', async () => {
    const { app } = await makeApp();
    const alice = await account(app, 'Alice', 'alice@example.com');
    await account(app, 'Bob Smith', 'bob@example.com');
    const response = await alice.agent.get('/api/users/search?q=bob');
    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].name).toBe('Bob Smith');
  });

  it('persists a friend request and only its recipient can accept it', async () => {
    const { app } = await makeApp();
    const alice = await account(app, 'Alice', 'alice@example.com');
    const bob = await account(app, 'Bob', 'bob@example.com');
    const charlie = await account(app, 'Charlie', 'charlie@example.com');
    const asked = await alice.agent.post('/api/friends/request').send({ userId: bob.user.id });
    expect(asked.status).toBe(201);
    expect((await charlie.agent.post(`/api/friends/${asked.body.request.id}/accept`)).status).toBe(403);
    const accepted = await bob.agent.post(`/api/friends/${asked.body.request.id}/accept`).send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.friendship).toMatchObject({ userA: expect.any(String), userB: expect.any(String) });
    expect((await alice.agent.get('/api/friends')).body.friends[0].user.name).toBe('Bob');
  });

  it('keeps an unregistered contact private and links it when that email registers', async () => {
    const { app } = await makeApp();
    const alice = await account(app, 'Alice', 'alice@example.com');
    const created = await alice.agent.post('/api/friends/contacts').send({
      name: 'Bob (offline)', email: 'bob@example.com',
    });
    expect(created.status).toBe(201);
    expect(created.body.contact.linkedUserId).toBeNull();

    const bob = await account(app, 'Bob', 'bob@example.com');
    const aliceFriends = await alice.agent.get('/api/friends');
    expect(aliceFriends.body.contacts[0]).toMatchObject({ name: 'Bob (offline)', linkedUserId: bob.user.id });
    expect(aliceFriends.body.friends[0].user.id).toBe(bob.user.id);
    expect((await bob.agent.get('/api/friends')).body.friends[0].user.name).toBe('Alice');
  });

  it('does not expose a friendship to unrelated users', async () => {
    const { app } = await makeApp();
    const { alice, friendship } = await acceptedFriendship(app);
    const charlie = await account(app, 'Charlie', 'charlie@example.com');
    expect((await charlie.agent.get(`/api/friendships/${friendship.id}`)).status).toBe(403);
    expect((await alice.agent.get(`/api/friendships/${friendship.id}`)).status).toBe(200);
  });

  it('creates groups with the creator as owner and authorizes member reads', async () => {
    const { app } = await makeApp();
    const alice = await account(app, 'Alice', 'alice@example.com');
    const bob = await account(app, 'Bob', 'bob@example.com');
    const charlie = await account(app, 'Charlie', 'charlie@example.com');
    const created = await alice.agent.post('/api/groups').send({
      name: 'Goa Trip', currency: 'INR', memberIds: [bob.user.id], simplifyDebts: true,
    });
    expect(created.status).toBe(201);
    const group = created.body.group;
    expect(group.members).toHaveLength(2);
    expect(group.members.find((member) => member.userId === alice.user.id).role).toBe('owner');
    expect((await bob.agent.get(`/api/groups/${group.id}`)).status).toBe(200);
    expect((await charlie.agent.get(`/api/groups/${group.id}`)).status).toBe(403);
  });

  it('allows only the owner to edit the group or manage its members', async () => {
    const { app } = await makeApp();
    const alice = await account(app, 'Alice', 'alice@example.com');
    const bob = await account(app, 'Bob', 'bob@example.com');
    const charlie = await account(app, 'Charlie', 'charlie@example.com');
    const created = await alice.agent.post('/api/groups').send({ name: 'Flat', memberIds: [bob.user.id] });
    const id = created.body.group.id;
    expect((await bob.agent.patch(`/api/groups/${id}`).send({ name: 'Not allowed' })).status).toBe(403);
    expect((await bob.agent.post(`/api/groups/${id}/members`).send({ userId: charlie.user.id })).status).toBe(403);
    const added = await alice.agent.post(`/api/groups/${id}/members`).send({ userId: charlie.user.id });
    expect(added.status).toBe(201);
    expect(added.body.group.members).toHaveLength(3);
  });
});
