const axios = require('axios');
const logger = require('./logger');
const configLoader = require('./config-loader');

class RequestHandler {
  constructor() {
    this.axios = axios.create();
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  async makeRequest(host, endpoint, method, data, apiKey, isStream = false, retryCount = 0) {
    try {
      const config = {
        method,
        url: `${host.url}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': isStream ? 'text/event-stream' : 'application/json'
        },
        timeout: host.timeout || 30000,
        responseType: isStream ? 'stream' : 'json'
      };

      if (data) {
        config.data = data;
      }

      logger.info(`Making request to ${host.id}`, { endpoint, method, retryCount });
      const response = await this.axios(config);
      return response;
    } catch (error) {
      const statusCode = error.response?.status;
      const shouldRetry = this.shouldRetryRequest(statusCode, retryCount);
      
      if (shouldRetry) {
        logger.info(`Retrying request to ${host.id} after error: ${error.message}`, { 
          statusCode, 
          retryCount: retryCount + 1 
        });
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retryCount + 1)));
        
        return this.makeRequest(host, endpoint, method, data, apiKey, isStream, retryCount + 1);
      }
      
      logger.error(`Request failed for host ${host.id}:`, error.message);
      throw error;
    }
  }

  shouldRetryRequest(statusCode, retryCount) {
    const retryableStatusCodes = [429, 404, 500, 502, 503, 504];
    return retryCount < this.maxRetries && retryableStatusCodes.includes(statusCode);
  }

  async handleChatCompletion(requestData, isStream = false) {
    const hosts = configLoader.getRandomHosts(5);
    const apiKey = configLoader.getRandomApiKey();
    const endpoint = '/v1/chat/completions';

    if (isStream) {
      requestData.stream = true;
    }

    return new Promise((resolve, reject) => {
      let hasResolved = false;
      let pendingRequests = hosts.length;
      let errors = [];

      const handleSuccess = (host, response) => {
        if (!hasResolved) {
          hasResolved = true;
          logger.info(`Using response from fastest host: ${host.id}`);
          resolve(response);
        } else if (isStream) {
          // If we've already resolved but it's a stream, close the unused stream
          response.data.destroy();
        }
      };

      const handleError = (host, error) => {
        pendingRequests--;
        errors.push({ host, error });
        
        if (pendingRequests === 0 && !hasResolved) {
          reject(new Error('All hosts failed to respond'));
        }
      };

      hosts.forEach(host => {
        this.makeRequest(host, endpoint, 'POST', requestData, apiKey, isStream)
          .then(response => {
            if (!hasResolved) {
              handleSuccess(host, response);
            }
          })
          .catch(error => {
            handleError(host, error);
          });
      });
    });
  }

  async handleEmbedding(requestData) {
    const hosts = configLoader.getRandomHosts(5);
    const apiKey = configLoader.getRandomApiKey();
    const endpoint = '/v1/embeddings';

    return new Promise((resolve, reject) => {
      let hasResolved = false;
      let pendingRequests = hosts.length;
      let errors = [];

      const handleSuccess = (host, response) => {
        if (!hasResolved) {
          hasResolved = true;
          logger.info(`Using response from fastest host: ${host.id}`);
          resolve(response);
        }
      };

      const handleError = (host, error) => {
        pendingRequests--;
        errors.push({ host, error });
        
        if (pendingRequests === 0 && !hasResolved) {
          reject(new Error('All hosts failed to respond'));
        }
      };

      hosts.forEach(host => {
        this.makeRequest(host, endpoint, 'POST', requestData, apiKey)
          .then(response => {
            if (!hasResolved) {
              handleSuccess(host, response);
            }
          })
          .catch(error => {
            handleError(host, error);
          });
      });
    });
  }
}

module.exports = new RequestHandler(); 