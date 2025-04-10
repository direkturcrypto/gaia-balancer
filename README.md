# Gaia Load Balancer

A high-performance load balancer for Gaia API endpoints with automatic failover and API key rotation support. This project provides a reliable way to distribute requests across multiple Gaia domains while ensuring optimal performance and fault tolerance.

## Features

- 🔄 Smart load balancing across multiple Gaia domains
- 🔑 Automatic API key rotation and management
- ⚡ Support for streaming responses
- 🔁 Automatic retry with configurable backoff
- 🛡️ Built-in error handling and failover
- 📊 Support for both chat completions and embeddings endpoints

## Installation

```bash
# Clone the repository
git clone https://github.com/direkturcrypto/gaia-balancer.git

# Install dependencies
cd gaia-balancer
npm install
```

## Configuration

### Hosts Configuration
Create or modify `config/hosts.json`:
```json
{
  "hosts": ["asia", "hyperliquid", "ukraine", "llama3b", "scroll", "nillion"]
}
```
Each string in the array represents a subdomain of `gaia.domains`.

### API Keys
The system supports automatic API key generation and rotation. Configure your API keys in `config/api-keys.json`:
```json
{
  "apiKeys": [
    {
      "key": "your-api-key",
      "description": "API Key description",
      "isActive": true
    }
  ]
}
```

## Usage

### Starting the Server
```bash
# Development mode
npm run dev

# Production mode
NODE_ENV=production npm start
```

### Making Requests

#### Chat Completions
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b-instruct",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant."
      },
      {
        "role": "user",
        "content": "Hello!"
      }
    ],
    "stream": true
  }'
```

#### Embeddings
```bash
curl -X POST http://localhost:3000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b-instruct",
    "input": "Your text here"
  }'
```

## Environment Variables

- `NODE_ENV`: Set to 'production' to disable debug logging
- `PORT`: Server port (default: 3000)

## Error Handling

The system includes comprehensive error handling:
- Automatic retry for status codes 429, 404, and 5xx
- Failover to alternative hosts on failure
- Detailed error logging in production

## Production Deployment

For production deployment:

1. Set environment to production:
```bash
export NODE_ENV=production
```

2. Configure your hosts in `config/hosts.json`
3. Set up your API keys
4. Start the server:
```bash
npm start
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details 