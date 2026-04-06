'use strict';
const { getDB } = require('../config/db');

const VALID_THEMES = ['light', 'dark', 'system'];
const VALID_NOTIF_TIMES = ['morning', 'afternoon', 'evening', 'night'];
const VALID_COMPANIONS = ['didi', 'bhaiya', 'friend'];

// ── GET /api/settings ──────────────────────────────────────────────────────────
function getSettings(req, res) {
  const db = getDB();

  // Ensure a settings row exists
  db.prepare(`
    INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)
  `).run(req.user.id);

  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);

  return res.json({
    theme: settings.theme,
    notifications: settings.notifications === 1,
    notifTime: settings.notif_time,
    companion: settings.companion,
    anonymous: settings.anonymous === 1,
    weeklyReport: settings.weekly_report === 1,
  });
}

// ── PUT /api/settings ──────────────────────────────────────────────────────────
function updateSettings(req, res) {
  const { theme, notifications, notifTime, companion, anonymous, weeklyReport } = req.body;

  if (theme !== undefined && !VALID_THEMES.includes(theme)) {
    return res.status(400).json({ error: `theme must be one of: ${VALID_THEMES.join(', ')}` });
  }
  if (notifTime !== undefined && !VALID_NOTIF_TIMES.includes(notifTime)) {
    return res.status(400).json({ error: `notifTime must be one of: ${VALID_NOTIF_TIMES.join(', ')}` });
  }
  if (companion !== undefined && !VALID_COMPANIONS.includes(companion)) {
    return res.status(400).json({ error: `companion must be one of: ${VALID_COMPANIONS.join(', ')}` });
  }

  const db = getDB();

  // Ensure row exists
  db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(req.user.id);

  // Build dynamic SET clause
  const updates = {};
  if (theme !== undefined) updates.theme = theme;
  if (notifications !== undefined) updates.notifications = notifications ? 1 : 0;
  if (notifTime !== undefined) updates.notif_time = notifTime;
  if (companion !== undefined) updates.companion = companion;
  if (anonymous !== undefined) updates.anonymous = anonymous ? 1 : 0;
  if (weeklyReport !== undefined) updates.weekly_report = weeklyReport ? 1 : 0;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  const values = Object.values(updates);

  db.prepare(`UPDATE user_settings SET ${setClauses} WHERE user_id = ?`).run(...values, req.user.id);

  const updated = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);

  // Also sync companion to user tone if companion field was updated
  if (companion !== undefined) {
    db.prepare('UPDATE users SET tone = ? WHERE id = ?').run(companion, req.user.id);
  }

  return res.json({
    theme: updated.theme,
    notifications: updated.notifications === 1,
    notifTime: updated.notif_time,
    companion: updated.companion,
    anonymous: updated.anonymous === 1,
    weeklyReport: updated.weekly_report === 1,
  });
}

module.exports = { getSettings, updateSettings };
