'use strict';
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getProfile, updateProfile, deleteAccount } = require('../controllers/userController');

// All user routes require authentication
router.use(authMiddleware);

// GET /api/user/profile
router.get('/profile', getProfile);

// PUT /api/user/profile
router.put('/profile', updateProfile);

// DELETE /api/user/account
router.delete('/account', deleteAccount);

module.exports = router;
