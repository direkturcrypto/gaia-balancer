const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const { getWallet } = require('./generate-wallet');

class ApiKeyManager {
  constructor() {
    this.apiKeysPath = path.join(__dirname, '../config/api-keys.json');
    this.apiKeys = [];
    this.rotationInterval = 10 * 60 * 1000; // 10 minutes in milliseconds
    this.rotationTimer = null;
  }

  async initialize() {
    try {
      await this.loadApiKeys();
      
      // If no API keys exist, generate them immediately
      if (this.apiKeys.length === 0) {
        logger.info('No API keys found. Generating initial set of API keys...');
        await this.rotateApiKeys();
      }
      
      this.startRotation();
      logger.info('API key manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize API key manager:', error);
      throw error;
    }
  }

  async loadApiKeys() {
    try {
      const data = await fs.readFile(this.apiKeysPath, 'utf8');
      this.apiKeys = JSON.parse(data).apiKeys;
      logger.info(`Loaded ${this.apiKeys.length} API keys`);
    } catch (error) {
      logger.error('Error loading API keys:', error);
      // If file doesn't exist or is invalid, create a new one
      this.apiKeys = [];
      await this.saveApiKeys();
    }
  }

  async saveApiKeys() {
    try {
      const data = JSON.stringify({ apiKeys: this.apiKeys }, null, 2);
      await fs.writeFile(this.apiKeysPath, data, 'utf8');
      logger.info(`Saved ${this.apiKeys.length} API keys`);
    } catch (error) {
      logger.error('Error saving API keys:', error);
      throw error;
    }
  }

  async generateNewApiKeys(count = 10) {
    logger.info(`Generating ${count} new API keys`);
    const newApiKeys = [];

    for (let i = 0; i < count; i++) {
      try {
        const { wallet, apiKey } = await getWallet();
        newApiKeys.push({
          key: apiKey,
          description: `Auto-generated key for wallet ${wallet.address}`,
          isActive: true,
          wallet: wallet.address,
          createdAt: new Date().toISOString()
        });
        logger.info(`Generated API key for wallet ${wallet.address}`);
      } catch (error) {
        logger.error(`Failed to generate API key: ${error.message}`);
      }
    }

    return newApiKeys;
  }

  async rotateApiKeys() {
    try {
      logger.info('Starting API key rotation');
      const newApiKeys = await this.generateNewApiKeys(10);
      
      if (newApiKeys.length > 0) {
        this.apiKeys = newApiKeys;
        await this.saveApiKeys();
        logger.info(`Rotated to ${this.apiKeys.length} new API keys`);
      } else {
        logger.warn('No new API keys were generated during rotation');
      }
    } catch (error) {
      logger.error('Error during API key rotation:', error);
    }
  }

  startRotation() {
    // Clear any existing timer
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    // Set up the rotation interval
    this.rotationTimer = setInterval(() => {
      this.rotateApiKeys();
    }, this.rotationInterval);

    logger.info(`API key rotation scheduled every ${this.rotationInterval / 60000} minutes`);
  }

  stopRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
      logger.info('API key rotation stopped');
    }
  }

  getRandomApiKey() {
    if (this.apiKeys.length === 0) {
      throw new Error('No API keys available');
    }

    const activeKeys = this.apiKeys.filter(key => key.isActive);
    if (activeKeys.length === 0) {
      throw new Error('No active API keys available');
    }

    const randomIndex = Math.floor(Math.random() * activeKeys.length);
    return activeKeys[randomIndex].key;
  }
}

module.exports = new ApiKeyManager(); 