'use strict';
process.env.USE_MOCK_LLM = 'true';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');
const { initDB, getDB } = require('../src/config/db');

let db;
let token;
let sessionId;

beforeAll(async () => {
  db = initDB();

  // Create a test user and get token
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email: 'chattest@example.com', password: 'password123', name: 'Chat Tester' });
  token = res.body.token;

  // Create a session
  const sessionRes = await request(app)
    .post('/api/chat/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Test Chat Session' });
  sessionId = sessionRes.body.sessionId;
});

afterAll(() => {
  try { db.close(); } catch (_) {}
});

describe('POST /api/chat/session', () => {
  it('should create a new chat session', async () => {
    const res = await request(app)
      .post('/api/chat/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My chat' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('sessionId');
    expect(res.body.title).toBe('My chat');
  });

  it('should return 401 without token', async () => {
    const res = await request(app).post('/api/chat/session').send({ title: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/chat/sessions', () => {
  it('should list user sessions', async () => {
    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions.length).toBeGreaterThan(0);
  });
});

describe('POST /api/chat/message', () => {
  it('should return an AI reply (mock)', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId, message: 'Hello! Kaise ho?' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.reply.length).toBeGreaterThan(0);
  });

  it('should return 400 if sessionId is missing', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Hello' });

    expect(res.status).toBe(400);
  });

  it('should return 400 if message is missing', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId });

    expect(res.status).toBe(400);
  });
});

describe('Crisis detection — POST /api/chat/message', () => {
  it('should intercept crisis keywords and return helpline info', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId, message: 'I want to kill myself, I cannot take it anymore' });

    expect(res.status).toBe(200);
    expect(res.body.crisis).toBe(true);
    expect(res.body).toHaveProperty('helplines');
    expect(Array.isArray(res.body.helplines)).toBe(true);
  });

  it('should NOT trigger crisis for normal messages', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId, message: 'Aaj exam tha, bahut nervous tha' });

    expect(res.status).toBe(200);
    expect(res.body.crisis).toBeUndefined();
    expect(res.body).toHaveProperty('reply');
  });
});

describe('GET /api/chat/history', () => {
  it('should return message history for a session', async () => {
    const res = await request(app)
      .get(`/api/chat/history?sessionId=${sessionId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
  });

  it('should return 400 if sessionId is missing', async () => {
    const res = await request(app)
      .get('/api/chat/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
