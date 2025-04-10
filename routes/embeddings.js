const express = require('express');
const router = express.Router();
const EmbeddingsController = require('../controllers/embeddings');

// Embeddings endpoint
router.post('/', EmbeddingsController.create);

module.exports = router; 