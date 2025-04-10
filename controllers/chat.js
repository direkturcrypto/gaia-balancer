const requestHandler = require('../lib/request-handler');
const logger = require('../lib/logger');

class ChatController {
  static async completion(req, res) {
    try {
      const isStream = req.body.stream === true;
      
      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const response = await requestHandler.handleChatCompletion(req.body, true);

        // Process the stream chunk by chunk
        response.data.on('data', chunk => {
          // Send each chunk directly without additional processing
          res.write(chunk);
          // Ensure the chunk is flushed immediately
          // res.flush();
        });

        // Handle stream completion
        response.data.on('end', () => {
          res.end();
        });

        // Handle stream errors
        response.data.on('error', error => {
          logger.error('Stream error:', error);
          res.end();
        });

        // Handle client disconnect
        req.on('close', () => {
          response.data.destroy();
        });
      } else {
        const response = await requestHandler.handleChatCompletion(req.body);
        res.json(response.data);
      }
    } catch (error) {
      logger.error('Error in chat completions:', error);
      res.status(500).json({
        error: {
          message: 'An error occurred while processing your request',
          type: 'internal_error'
        }
      });
    }
  }
}

module.exports = ChatController; 