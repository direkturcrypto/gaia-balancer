const axios = require('axios');
const logger = require('./logger');
const configLoader = require('./config-loader');
const crypto = require('crypto');
const { Transform } = require('stream');

class RequestHandler {
  constructor() {
    this.axios = axios.create();
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    this.maxAttemptTime = 120000; // 2 minutes in milliseconds
    this.openRouterFallback = {
      isActive: false,
      endTime: 0,
      model: "meta-llama/llama-3.1-8b-instruct",
      enabled: process.env.OPENROUTER_FALLBACK_ENABLED === 'true' // Default to false
    };
  }

  // Check if we should use OpenRouter fallback
  shouldUseOpenRouter() {
    if (!this.openRouterFallback.enabled) return false;
    if (!this.openRouterFallback.isActive) return false;
    if (Date.now() > this.openRouterFallback.endTime) {
      this.openRouterFallback.isActive = false;
      return false;
    }
    return true;
  }

  // Enable/disable OpenRouter fallback
  setOpenRouterFallbackEnabled(enabled) {
    this.openRouterFallback.enabled = enabled;
    logger.info(`OpenRouter fallback ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Check if host is a Gaia host
  isGaiaHost(host) {
    // Assuming Gaia hosts have 'gaia' in their ID or URL
    return host.id.toLowerCase().includes('gaia') || host.url.toLowerCase().includes('gaia');
  }

  // Activate OpenRouter fallback
  activateOpenRouterFallback(durationMinutes = 5) {
    if (!this.openRouterFallback.enabled) {
      logger.info('OpenRouter fallback is disabled, skipping activation');
      return;
    }
    this.openRouterFallback.isActive = true;
    this.openRouterFallback.endTime = Date.now() + (durationMinutes * 60 * 1000);
    logger.info('OpenRouter fallback activated', { 
      duration: durationMinutes,
      endTime: new Date(this.openRouterFallback.endTime).toISOString(),
      timestamp: new Date().toISOString()
    });
  }

  // Generate a random ID for stream messages
  generateStreamId() {
    return crypto.randomBytes(10).toString('hex');
  }

  // Format stream message according to the specified format
  formatStreamMessage(content, model = "meta-llama/llama-3.1-8b-instruct/fp-8") {
    return {
      id: this.generateStreamId(),
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          delta: {
            role: null,
            content: content,
            reasoning_content: null,
            tool_calls: null
          },
          logprobs: null,
          finish_reason: null,
          matched_stop: null
        }
      ],
      usage: null,
      system_fingerprint: ""
    };
  }

  async makeRequest(host, endpoint, method, data, apiKey, isStream = false, retryCount = 0) {
    try {
      // Check if we should use OpenRouter fallback
      if (this.shouldUseOpenRouter() && this.isGaiaHost(host)) {
        const openRouterHost = {
          id: 'openrouter',
          url: 'https://openrouter.ai/api/',
          timeout: 30000
        };
        const openRouterApiKey = process.env.OPENROUTER_API_KEY;
        
        if (!openRouterApiKey) {
          throw new Error('OpenRouter API key not found');
        }

        // Modify request data for OpenRouter
        const openRouterData = {
          ...data,
          model: this.openRouterFallback.model
        };

        logger.info('Using OpenRouter fallback', { 
          model: this.openRouterFallback.model,
          timeRemaining: Math.ceil((this.openRouterFallback.endTime - Date.now()) / 1000 / 60),
          timestamp: new Date().toISOString()
        });

        return this.makeRequest(openRouterHost, endpoint, method, openRouterData, openRouterApiKey, isStream, retryCount);
      }

      const config = {
        method,
        url: `${host.url}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': isStream ? 'text/event-stream' : 'application/json',
          'HTTP-Referer': 'vikey.ai',
          'X-Title': 'Vikey Hybrid'
        },
        timeout: host.timeout || 30000,
        responseType: isStream ? 'stream' : 'json',
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      };

      if (data) {
        config.data = data;
      }

      logger.info(`Making request to ${host.id}`, { endpoint, method, retryCount });
      const response = await this.axios(config);

      if (isStream) {
        // Add error handler to the stream
        response.data.on('error', (error) => {
          logger.error(`Stream error from ${host.id}:`, error);
        });
      }

      return response;
    } catch (error) {
      const statusCode = error.response?.status;
      
      // Handle Gaia rate limiting
      if (statusCode === 429 && this.isGaiaHost(host)) {
        const fallbackDuration = parseInt(process.env.OPENROUTER_FALLBACK_DURATION || '5');
        this.activateOpenRouterFallback(fallbackDuration);
        
        // Retry with OpenRouter
        return this.makeRequest(host, endpoint, method, data, apiKey, isStream, retryCount);
      }

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
    const retryableStatusCodes = [404, 500, 502, 503, 504];
    return retryCount < this.maxRetries && retryableStatusCodes.includes(statusCode);
  }

  async handleChatCompletion(requestData, isStream = false) {
    const apiKey = configLoader.getRandomApiKey();
    const endpoint = '/v1/chat/completions';
    const startTime = Date.now();

    // Check if we should use OpenRouter first
    if (this.shouldUseOpenRouter()) {
      const openRouterHost = {
        id: 'openrouter',
        url: 'https://openrouter.ai/api',
        timeout: 30000
      };
      const openRouterApiKey = process.env.OPENROUTER_API_KEY;
      
      if (!openRouterApiKey) {
        throw new Error('OpenRouter API key not found');
      }

      // Modify request data for OpenRouter
      const openRouterData = {
        ...requestData,
        model: this.openRouterFallback.model
      };

      if (isStream) {
        openRouterData.stream = true;
      }

      logger.info('Using OpenRouter fallback', { 
        model: this.openRouterFallback.model,
        timeRemaining: Math.ceil((this.openRouterFallback.endTime - Date.now()) / 1000 / 60),
        timestamp: new Date().toISOString()
      });

      // Make single request to OpenRouter
      return new Promise((resolve, reject) => {
        this.makeRequest(openRouterHost, endpoint, 'POST', openRouterData, openRouterApiKey, isStream)
          .then(response => {
            if (isStream) {
              response.data.on('error', (error) => {
                logger.error(`Stream error from OpenRouter:`, error);
                reject(error);
              });

              response.data.on('end', () => {
                logger.info('OpenRouter stream ended');
              });
            }
            resolve(response);
          })
          .catch(error => {
            logger.error(`OpenRouter request failed:`, error.message);
            reject(error);
          });
      });
    }

    // If not using OpenRouter, proceed with normal Gaia hosts
    const hosts = configLoader.getRandomHosts(5);

    if (isStream) {
      requestData.stream = true;
    }

    return new Promise((resolve, reject) => {
      let hasResolved = false;
      let pendingRequests = hosts.length;
      let errors = [];
      let activeStreams = new Set();
      let isAttempting = true;
      let selectedStream = null;
      let retryInterval = null;
      let responseSent = false;

      const cleanup = () => {
        // Cleanup all active streams except the one that was successful
        for (const stream of activeStreams) {
          if (stream !== selectedStream) {
            try {
              stream.destroy();
            } catch (e) {
              logger.error('Error destroying stream:', e);
            }
          }
        }
        activeStreams.clear();
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
      };

      const handleSuccess = (host, response) => {
        if (!hasResolved && !responseSent) {
          hasResolved = true;
          isAttempting = false;
          responseSent = true;
          logger.info(`Using response from fastest host: ${host.id}`);

          if (isStream) {
            // Keep track of the successful stream
            selectedStream = response.data;
            activeStreams.add(response.data);

            // Add error handler to the stream
            response.data.on('error', (error) => {
              logger.error(`Stream error from ${host.id}:`, error);
              if (!hasResolved) {
                reject(error);
              }
            });

            // Add end handler
            response.data.on('end', () => {
              activeStreams.delete(response.data);
              cleanup();
            });

            // Format the stream response
            const originalPipe = response.data.pipe;
            response.data.pipe = function(dest) {
              const formattedStream = new Transform({
                objectMode: true,
                transform: (chunk, encoding, callback) => {
                  try {
                    // Parse the chunk if it's a string
                    let data = chunk;
                    if (typeof chunk === 'string') {
                      // Remove "data: " prefix if present
                      const cleanData = chunk.replace(/^data: /, '');
                      if (cleanData.trim() === '[DONE]') {
                        return callback(null, 'data: [DONE]\n\n');
                      }
                      try {
                        data = JSON.parse(cleanData);
                      } catch (e) {
                        // If parsing fails, just pass through the original chunk
                        return callback(null, chunk);
                      }
                    }

                    // Format the message according to our format
                    const formattedMessage = this.formatStreamMessage(
                      data.choices?.[0]?.delta?.content || '',
                      data.model || "meta-llama/llama-3.1-8b-instruct/fp-8"
                    );

                    // Convert to string and add SSE format
                    const formattedString = `data: ${JSON.stringify(formattedMessage)}\n\n`;
                    callback(null, formattedString);
                  } catch (error) {
                    logger.error('Error formatting stream message:', error);
                    callback(null, chunk);
                  }
                }
              });

              return originalPipe.call(this, formattedStream).pipe(dest);
            }.bind(response.data);
          }

          resolve(response);
          if (!isStream) {
            cleanup();
          }
        } else if (isStream) {
          // If this stream wasn't chosen, destroy it
          response.data.destroy();
        }
      };

      const retryFailedHosts = () => {
        if (!isAttempting || responseSent) return;
        
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime >= this.maxAttemptTime) {
          cleanup();
          return;
        }

        const newHosts = configLoader.getRandomHosts(5);
        newHosts.forEach(newHost => {
          this.makeRequest(newHost, endpoint, 'POST', requestData, apiKey, isStream)
            .then(response => {
              if (isStream) {
                activeStreams.add(response.data);
              }
              if (!hasResolved && !responseSent) {
                handleSuccess(newHost, response);
              }
            })
            .catch(error => {
              logger.error(`Retry failed for host ${newHost.id}:`, error.message);
            });
        });
      };

      const handleError = (host, error) => {
        pendingRequests--;
        errors.push({ host, error });
        
        if (pendingRequests === 0 && !hasResolved && !responseSent) {
          // Start retrying in the background
          retryInterval = setInterval(retryFailedHosts, 5000); // Retry every 5 seconds
        }
      };

      // Make requests to all hosts
      hosts.forEach(host => {
        this.makeRequest(host, endpoint, 'POST', requestData, apiKey, isStream)
          .then(response => {
            if (isStream) {
              activeStreams.add(response.data);
            }
            if (!hasResolved && !responseSent) {
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
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let hasResolved = false;
      let pendingRequests = hosts.length;
      let errors = [];
      let isAttempting = true;
      let retryInterval = null;
      let responseSent = false;

      const cleanup = () => {
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
      };

      const handleSuccess = (host, response) => {
        if (!hasResolved && !responseSent) {
          hasResolved = true;
          isAttempting = false;
          responseSent = true;
          logger.info(`Using response from fastest host: ${host.id}`);
          resolve(response);
          cleanup();
        }
      };

      const retryFailedHosts = () => {
        if (!isAttempting || responseSent) return;
        
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime >= this.maxAttemptTime) {
          cleanup();
          return;
        }

        const newHosts = configLoader.getRandomHosts(5);
        newHosts.forEach(newHost => {
          this.makeRequest(newHost, endpoint, 'POST', requestData, apiKey)
            .then(response => {
              if (!hasResolved && !responseSent) {
                handleSuccess(newHost, response);
              }
            })
            .catch(error => {
              logger.error(`Retry failed for host ${newHost.id}:`, error.message);
            });
        });
      };

      const handleError = (host, error) => {
        pendingRequests--;
        errors.push({ host, error });
        
        if (pendingRequests === 0 && !hasResolved && !responseSent) {
          // Start retrying in the background
          retryInterval = setInterval(retryFailedHosts, 5000); // Retry every 5 seconds
        }
      };

      hosts.forEach(host => {
        this.makeRequest(host, endpoint, 'POST', requestData, apiKey)
          .then(response => {
            if (!hasResolved && !responseSent) {
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