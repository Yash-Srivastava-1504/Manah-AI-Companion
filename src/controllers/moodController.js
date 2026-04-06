'use strict';
const { getDB } = require('../config/db');

// ── POST /api/mood ─────────────────────────────────────────────────────────────
function logMood(req, res) {
  const { date, level, note, tags } = req.body;

  if (!date || level === undefined || level === null) {
    return res.status(400).json({ error: 'date and level are required' });
  }

  if (!Number.isInteger(level) || level < 0 || level > 4) {
    return res.status(400).json({ error: 'level must be an integer between 0 and 4' });
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
  }

  const db = getDB();
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);

  // Upsert: one mood entry per user per day
  const existing = db.prepare(
    'SELECT id FROM moods WHERE user_id = ? AND date = ?'
  ).get(req.user.id, date);

  let id;
  if (existing) {
    db.prepare(`
      UPDATE moods SET level = ?, note = ?, tags = ? WHERE id = ?
    `).run(level, note || null, tagsJson, existing.id);
    id = existing.id;
  } else {
    const result = db.prepare(`
      INSERT INTO moods (user_id, date, level, note, tags) VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, date, level, note || null, tagsJson);
    id = Number(result.lastInsertRowid);
  }

  const entry = db.prepare('SELECT * FROM moods WHERE id = ?').get(id);
  return res.status(201).json({
    id: entry.id,
    date: entry.date,
    level: entry.level,
    note: entry.note,
    tags: JSON.parse(entry.tags || '[]'),
  });
}

// ── GET /api/mood ──────────────────────────────────────────────────────────────
function getMoods(req, res) {
  const { start, end } = req.query;
  const db = getDB();

  let rows;
  if (start && end) {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ error: 'start and end must be in YYYY-MM-DD format' });
    }
    rows = db.prepare(`
      SELECT id, date, level, note, tags FROM moods
      WHERE user_id = ? AND date >= ? AND date <= ?
      ORDER BY date ASC
    `).all(req.user.id, start, end);
  } else {
    // Last 30 days by default
    rows = db.prepare(`
      SELECT id, date, level, note, tags FROM moods
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT 30
    `).all(req.user.id);
  }

  const entries = rows.map((r) => ({
    id: r.id,
    date: r.date,
    level: r.level,
    note: r.note,
    tags: JSON.parse(r.tags || '[]'),
  }));

  return res.json({ entries });
}

module.exports = { logMood, getMoods };
