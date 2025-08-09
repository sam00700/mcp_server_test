# CLAUDE.md

## Project GOAL
The main goal of this test is to make sure you help me replicate Claude's functions following the official anthropic documentation.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) client written in TypeScript that connects to MCP servers and enables AI-powered interactions through Claude. The client supports both stdio-based connections (for script-based servers) and HTTP-based connections.

## Commands

### Build
```bash
npm run build
```
Compiles TypeScript to JavaScript and makes the output executable. The built executable will be at `build/index.js`.

### Run the Client
```bash
node build/index.js <server_name_or_path>
```

Examples:
- `node build/index.js airbnb` - Connect to pre-configured Airbnb MCP server
- `node build/index.js calculate` - Connect to pre-configured calculator server
- `node build/index.js path/to/server.py` - Connect to custom Python MCP server
- `node build/index.js http://localhost:3000/mcp` - Connect to HTTP MCP server

### TypeScript Development
Use `tsc --watch` for continuous compilation during development.

## Architecture

### Core Components

- **MCPClient class** (`index.ts`): Main client that handles connections to MCP servers and interactions with Claude
- **MCP Server Configuration** (`mcp-servers.config.ts`): Centralized configuration for pre-configured MCP servers

### Connection Types

1. **Named Server Connection**: Uses pre-configured servers from `mcp-servers.config.ts`
2. **Direct Path Connection**: Connects to Python (.py) or JavaScript (.js) MCP servers via stdio
3. **HTTP Connection**: Connects to HTTP-based MCP servers

### Key Dependencies

- `@anthropic-ai/sdk`: Claude API integration
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `dotenv`: Environment variable management (requires ANTHROPIC_API_KEY)

### Environment Variables

Required:
- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude access

### Server Configuration

MCP servers are configured in `mcp-servers.config.ts` with the structure:
```typescript
{
  serverName: {
    command: "command_to_run",
    args: ["arg1", "arg2"],
    description?: "Optional description",
    env?: { "ENV_VAR": "value" }
  }
}
```

The client automatically inherits the current process environment and can add server-specific environment variables.

### Chat Flow

1. Client connects to specified MCP server
2. Lists available tools from the server
3. Enters interactive chat loop
4. User queries are processed through Claude with access to MCP tools
5. Tool calls are executed on the MCP server
6. Results are fed back to Claude for final response