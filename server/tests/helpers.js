/** Test helpers: a real app instance backed by the in-memory repository. */
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMemoryRepo } from '../src/storage/memoryStore.js';

export const CREDENTIALS = {
  name: 'Sonakshi',
  email: 'test@example.com',
  password: 'budget2026',
};

export async function makeApp() {
  const repo = await createMemoryRepo().init();
  return { app: createApp(repo), repo };
}

/** An app plus a supertest agent that is already signed in (cookies persist). */
export async function signedInAgent(credentials = CREDENTIALS) {
  const { app, repo } = await makeApp();
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send(credentials);
  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { app, repo, agent, user: response.body.user };
}

/** Read the store, apply a change, save it back — mirrors what the client does. */
export async function patchStore(agent, mutate) {
  const before = await agent.get('/api/budget');
  const next = mutate(structuredClone(before.body.store));
  return agent.put('/api/budget').send({ store: next, rev: before.body.rev });
}
