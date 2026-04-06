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

beforeAll(async () => {
  db = initDB();

  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email: 'moodtest@example.com', password: 'password123', name: 'Mood Tester' });
  
  if (res.status !== 201) {
    console.error('MOOD TEST SIGNUP FAILED:', res.status, res.body);
  }
  token = res.body.token;
});

afterAll(() => {
  try { db.close(); } catch (_) {}
});

describe('POST /api/mood', () => {
  it('should save a mood entry', async () => {
    const res = await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-04-05', level: 3, note: 'Feeling okay today' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.date).toBe('2026-04-05');
    expect(res.body.level).toBe(3);
    expect(res.body.note).toBe('Feeling okay today');
  });

  it('should upsert — update existing entry for same date', async () => {
    await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-04-06', level: 2, note: 'First entry' });

    const res = await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-04-06', level: 4, note: 'Updated entry' });

    expect(res.status).toBe(201);
    expect(res.body.level).toBe(4);
    expect(res.body.note).toBe('Updated entry');
  });

  it('should return 400 for invalid level', async () => {
    const res = await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-04-07', level: 10 });

    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid date format', async () => {
    const res = await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '05-04-2026', level: 2 });

    expect(res.status).toBe(400);
  });

  it('should return 400 if required fields are missing', async () => {
    const res = await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'No date or level' });

    expect(res.status).toBe(400);
  });

  it('should return 401 without token', async () => {
    const res = await request(app)
      .post('/api/mood')
      .send({ date: '2026-04-05', level: 2 });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/mood', () => {
  it('should return mood entries in date range', async () => {
    // Insert some entries first
    await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-04-01', level: 1 });
    await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-04-02', level: 2 });
    await request(app)
      .post('/api/mood')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-04-03', level: 3 });

    const res = await request(app)
      .get('/api/mood?start=2026-04-01&end=2026-04-03')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(3);
  });

  it('should return default last 30 days if no range provided', async () => {
    const res = await request(app)
      .get('/api/mood')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/mood');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/settings & PUT /api/settings', () => {
  it('should return default settings', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('theme');
    expect(res.body).toHaveProperty('notifications');
  });

  it('should update settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: 'dark', notifications: false });

    expect(res.status).toBe(200);
    expect(res.body.theme).toBe('dark');
    expect(res.body.notifications).toBe(false);
  });

  it('should return 400 for invalid theme', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ theme: 'rainbow' });

    expect(res.status).toBe(400);
  });
});
