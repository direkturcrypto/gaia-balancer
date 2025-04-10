const requestHandler = require('../lib/request-handler');
const logger = require('../lib/logger');

class EmbeddingsController {
  static async create(req, res) {
    try {
      const response = await requestHandler.handleEmbedding(req.body);
      res.json(response.data);
    } catch (error) {
      logger.error('Error in embeddings:', error);
      res.status(500).json({
        error: {
          message: 'An error occurred while processing your request',
          type: 'internal_error'
        }
      });
    }
  }
}

module.exports = EmbeddingsController; 