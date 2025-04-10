const express = require('express');
const router = express.Router();
const ChatController = require('../controllers/chat');

// Chat completions endpoint
router.post('/completions', ChatController.completion);

module.exports = router; 