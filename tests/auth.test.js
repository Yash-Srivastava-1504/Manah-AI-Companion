'use strict';
process.env.USE_MOCK_LLM = 'true';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');
const { initDB, getDB } = require('../src/config/db');

let db;

beforeAll(() => {
  db = initDB();
});

afterAll(() => {
  try { db.close(); } catch (_) {}
});

afterEach(() => {
  // Clean up users between tests
  try {
    db.prepare('DELETE FROM refresh_tokens').run();
    db.prepare('DELETE FROM user_settings').run();
    db.prepare('DELETE FROM users').run();
  } catch (_) {}
});

describe('POST /api/auth/signup', () => {
  it('should create a new user and return tokens', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'test@example.com', password: 'password123', name: 'Tester' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).toMatchObject({ email: 'test@example.com', name: 'Tester' });
  });

  it('should return 400 if email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('should return 400 if password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'a@b.com', password: '123' });
    expect(res.status).toBe(400);
  });

  it('should return 409 if email already exists', async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'dup@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'dup@example.com', password: 'password123' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/signup')
      .send({ email: 'login@example.com', password: 'password123', name: 'Login Test' });
  });

  it('should return tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('should return 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });

  it('should return 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('should return a new access token with valid refresh token', async () => {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'refresh@example.com', password: 'password123' });

    const { refreshToken } = signup.body;

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('should return 401 for invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/user/profile', () => {
  it('should return user profile when authenticated', async () => {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'profile@example.com', password: 'password123', name: 'Profile Test' });

    const { token } = signup.body;

    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Profile Test');
  });

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/user/profile');
    expect(res.status).toBe(401);
  });
});
