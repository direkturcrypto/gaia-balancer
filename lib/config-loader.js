const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const apiKeyManager = require('./api-key-manager');

class ConfigLoader {
  constructor() {
    this.hosts = null;
    this.timeout = 30000; // Default timeout
  }

  async loadHosts() {
    try {
      const hostsPath = path.join(__dirname, '../config/hosts.json');
      const hostsData = await fs.readFile(hostsPath, 'utf8');
      this.hosts = JSON.parse(hostsData).hosts;
      logger.info('Hosts configuration loaded successfully');
      return this.hosts;
    } catch (error) {
      logger.error('Error loading hosts configuration:', error);
      throw new Error('Failed to load hosts configuration');
    }
  }

  async initialize() {
    try {
      await this.loadHosts();
      await apiKeyManager.initialize();
      logger.info('Configuration initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize configuration:', error);
      throw error;
    }
  }

  getRandomHosts(count = 5) {
    if (!this.hosts) {
      throw new Error('Hosts configuration not loaded');
    }
    const shuffled = [...this.hosts].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(host => ({
      id: host,
      url: `https://${host}.gaia.domains`,
      timeout: this.timeout
    }));
  }

  getRandomApiKey() {
    return apiKeyManager.getRandomApiKey();
  }
}

module.exports = new ConfigLoader(); 