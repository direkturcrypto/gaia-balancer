const express = require('express');
const configLoader = require('./lib/config-loader');
const logger = require('./lib/logger');

// Import routes
const chatRoutes = require('./routes/chat');
const embeddingsRoutes = require('./routes/embeddings');

const app = express();
app.use(express.json());

// Initialize configurations
async function initialize() {
  try {
    await configLoader.initialize();
    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// Register routes
app.use('/v1/chat', chatRoutes);
app.use('/v1/embeddings', embeddingsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      message: 'An unexpected error occurred',
      type: 'internal_error'
    }
  });
});

const PORT = process.env.PORT || 3000;

// Initialize and start the server
initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
