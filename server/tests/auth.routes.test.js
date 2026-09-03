/** Register / login / logout / me over HTTP, against the in-memory repository. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { CREDENTIALS, makeApp, signedInAgent } from './helpers.js';

const cookieHeader = (response) => response.headers['set-cookie']?.join(';') || '';

describe('POST /api/auth/register', () => {
  it('creates the account, returns it, and sets an httpOnly session cookie', async () => {
    const { app } = await makeApp();
    const response = await request(app).post('/api/auth/register').send(CREDENTIALS);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: 'test@example.com', name: 'Sonakshi' });
    expect(response.body.user.id).toBeTruthy();
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(cookieHeader(response)).toMatch(/em_session=/);
    expect(cookieHeader(response)).toMatch(/HttpOnly/i);
  });

  it('stores a hash, never the password itself', async () => {
    const { app, repo } = await makeApp();
    await request(app).post('/api/auth/register').send(CREDENTIALS);
    const stored = await repo.findUserByEmail('test@example.com');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(stored)).not.toContain(CREDENTIALS.password);
  });

  it('lower-cases the email so Test@ and test@ are one account', async () => {
    const { app } = await makeApp();
    await request(app).post('/api/auth/register').send({ ...CREDENTIALS, email: 'TEST@example.com' });
    const again = await request(app).post('/api/auth/register').send(CREDENTIALS);
    expect(again.status).toBe(400);
    expect(again.body.error.fieldErrors.email).toMatch(/already exists/);
  });

  it('reports field errors for bad input instead of a generic failure', async () => {
    const { app } = await makeApp();
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.error.fieldErrors).toHaveProperty('name');
    expect(response.body.error.fieldErrors).toHaveProperty('email');
  });

  it('rejects a password that breaks the rules, pointing at the field', async () => {
    const { app } = await makeApp();
    const response = await request(app).post('/api/auth/register').send({ ...CREDENTIALS, password: 'onlyletters' });
    expect(response.status).toBe(400);
    expect(response.body.error.fieldErrors.password).toMatch(/letter and one number/);
  });

  it('gives every new account its own empty budget document', async () => {
    const { app } = await makeApp();
    const first = await request(app).post('/api/auth/register').send(CREDENTIALS);
    const second = await request(app).post('/api/auth/register')
      .send({ ...CREDENTIALS, email: 'other@example.com' });

    expect(second.status).toBe(201);
    expect(second.body.user.id).not.toBe(first.body.user.id);
  });
});

describe('POST /api/auth/login', () => {
  it('accepts the right password and returns the account', async () => {
    const { app } = await makeApp();
    await request(app).post('/api/auth/register').send(CREDENTIALS);

    const response = await request(app).post('/api/auth/login')
      .send({ email: 'test@example.com', password: CREDENTIALS.password });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('test@example.com');
    expect(cookieHeader(response)).toMatch(/em_session=/);
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const { app } = await makeApp();
    await request(app).post('/api/auth/register').send(CREDENTIALS);

    const wrongPassword = await request(app).post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpass1' });
    const unknownEmail = await request(app).post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: CREDENTIALS.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });
});

describe('session', () => {
  it('GET /api/auth/me returns null when signed out and the user when signed in', async () => {
    const { app, agent } = await signedInAgent();
    const anonymous = await request(app).get('/api/auth/me');
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.user).toBeNull();

    const mine = await agent.get('/api/auth/me');
    expect(mine.body.user.email).toBe('test@example.com');
  });

  it('accepts a Bearer token as well as the cookie', async () => {
    const { app } = await makeApp();
    const registered = await request(app).post('/api/auth/register').send(CREDENTIALS);
    const token = cookieHeader(registered).match(/em_session=([^;]+)/)[1];

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(response.body.user.email).toBe('test@example.com');
  });

  it('ignores a tampered token instead of trusting it', async () => {
    const { app } = await makeApp();
    await request(app).post('/api/auth/register').send(CREDENTIALS);
    const forged = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIn0.notarealsignature';

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(response.body.user).toBeNull();
    const guarded = await request(app).get('/api/budget').set('Authorization', `Bearer ${forged}`);
    expect(guarded.status).toBe(401);
  });

  it('logout clears the cookie and locks the budget again', async () => {
    const { agent } = await signedInAgent();
    expect((await agent.get('/api/budget')).status).toBe(200);

    const loggedOut = await agent.post('/api/auth/logout');
    expect(loggedOut.status).toBe(200);
    expect((await agent.get('/api/budget')).status).toBe(401);
  });

  it('PATCH /api/auth/profile renames the account', async () => {
    const { agent } = await signedInAgent();
    const response = await agent.patch('/api/auth/profile').send({ name: 'Sona' });
    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe('Sona');
    expect((await agent.get('/api/auth/me')).body.user.name).toBe('Sona');
  });
});
