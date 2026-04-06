const request = require('supertest');
const app = require('./server');
const { initDB } = require('./src/config/db');

async function test() {
  const db = initDB();
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email: 'moodtest123@example.com', password: 'password123', name: 'Mood Tester' });
  
  if(res.status !== 201) {
    console.log('Signup Failed:', res.status, res.body);
    return;
  }
  const token = res.body.token;

  const res2 = await request(app)
    .post('/api/mood')
    .set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-04-05', level: 3, note: 'Feeling okay today' });

  console.log('Mood POST Result:', res2.status, res2.body);
  process.exit(0);
}

test();
