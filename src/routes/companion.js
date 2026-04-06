'use strict';
const express = require('express');
const router = express.Router();
const { supabaseAuthMiddleware } = require('../middleware/supabaseAuth');
const { companionChatStream } = require('../controllers/companionController');

router.post('/chat', supabaseAuthMiddleware, companionChatStream);

module.exports = router;
