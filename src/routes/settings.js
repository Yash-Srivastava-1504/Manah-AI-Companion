'use strict';
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getSettings, updateSettings } = require('../controllers/settingsController');

// All settings routes require authentication
router.use(authMiddleware);

// GET /api/settings
router.get('/', getSettings);

// PUT /api/settings
router.put('/', updateSettings);

module.exports = router;
