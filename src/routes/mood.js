'use strict';
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { logMood, getMoods } = require('../controllers/moodController');

// All mood routes require authentication
router.use(authMiddleware);

// POST /api/mood — log a mood entry
router.post('/', logMood);

// GET /api/mood?start=YYYY-MM-DD&end=YYYY-MM-DD — get mood history
router.get('/', getMoods);

module.exports = router;
