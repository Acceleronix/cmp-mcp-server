# CMP MCP Server

A Model Context Protocol (MCP) server for CMP (Connectivity Management Platform) API integration, built for Cloudflare Workers.

## Features

- 🔍 **Query SIM List** - Retrieve SIM cards with filtering options (status, date range, ICCID range, etc.)
- 📱 **Query SIM Details** - Get comprehensive SIM card information including usage statistics
- 🔐 **Secure Authentication** - HMAC-SHA256 signature-based API authentication
- ☁️ **Cloudflare Workers** - Serverless deployment with global edge network
- 🌐 **MCP Compatible** - Works with Claude Desktop and other MCP clients

## Quick Start

### 1. Environment Setup

Create your environment variables in Cloudflare Workers dashboard:

```bash
# Required environment variables (set as secrets in Cloudflare)
CMP_APP_KEY=your_cmp_app_key
CMP_APP_SECRET=your_cmp_app_secret
```

The `CMP_ENDPOINT` is already configured in `wrangler.jsonc`.

### 2. Deploy to Cloudflare Workers

```bash
# Install dependencies
npm install

# Deploy to Cloudflare Workers
npm run deploy
```

### 3. Local Development

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your actual credentials
# Then start development server
npm run dev
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CMP_APP_KEY` | Your CMP API application key | ✅ |
| `CMP_APP_SECRET` | Your CMP API application secret | ✅ |
| `CMP_ENDPOINT` | CMP API endpoint URL | ❌ (defaults to production) |

### Setting Secrets in Cloudflare

```bash
# Set your API credentials as secrets
wrangler secret put CMP_APP_KEY
wrangler secret put CMP_APP_SECRET
```

## Available Tools

### `query_sim_list`

Query SIM cards with filtering options.

**Parameters:**
- `pageNum` (optional): Page number (default: 1)
- `pageSize` (optional): Records per page (default: 10, max: 1000)
- `enterpriseDataPlan` (optional): Enterprise data plan name
- `expirationTimeStart` (optional): Start expiration date (yyyy-MM-dd)
- `expirationTimeEnd` (optional): End expiration date (yyyy-MM-dd)
- `iccidStart` (optional): ICCID start range
- `iccidEnd` (optional): ICCID end range
- `label` (optional): SIM card label
- `simState` (optional): SIM state (2=Pre-activation, 3=Test, 4=Silent, 5=Standby, 6=Active, 7=Shutdown, 8=Pause, 10=Pre-logout, 11=Logout)
- `simType` (optional): SIM card type

### `query_sim_detail`

Get detailed information for a specific SIM card.

**Parameters:**
- `iccid` (required): SIM card ICCID number

## Connect to Claude Desktop

To connect your MCP server to Claude Desktop, follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and update your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "cmp-server": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-cmp-server.workers.dev/sse"
      ]
    }
  }
}
```

## Connect to Cloudflare AI Playground

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL (`your-cmp-server.workers.dev/sse`)
3. Start using your CMP tools directly!

## Development

### Project Structure

```
src/
├── index.ts        # Main MCP server implementation
├── cmp_client.ts   # CMP API client with authentication
└── ...
```

### Scripts

```bash
npm run dev         # Start development server
npm run deploy      # Deploy to Cloudflare Workers
npm run type-check  # Run TypeScript type checking
npm run lint:fix    # Fix linting issues
npm run format      # Format code
```

## Security

- ✅ API credentials stored as Cloudflare Workers secrets
- ✅ HMAC-SHA256 signature authentication
- ✅ Environment variables validation
- ✅ No sensitive data in source code
- ✅ `.gitignore` configured for security

## License

MIT License - see LICENSE file for details. 
