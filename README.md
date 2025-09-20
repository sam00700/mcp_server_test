# MCP Client TypeScript

An advanced MCP (Model Context Protocol) client written in TypeScript that connects to MCP servers and enables AI-powered interactions through Claude. This client supports both stdio-based connections (for script-based servers) and HTTP-based connections with parallel and sequential tool execution modes.

## Features

- 🚀 Connect to multiple MCP servers simultaneously
- 🔄 Support for both parallel and sequential tool execution
- 📡 Support for both stdio and HTTP-based MCP servers
- ⚙️ Configurable server management
- 💬 Interactive chat interface with Claude
- 🛠️ Built-in support for popular MCP servers (Airbnb, Calculator)

## Prerequisites

- Node.js >= 16.0.0
- npm or yarn package manager
- Anthropic API key

## Installation & Setup

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd mcp_server_test
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory:

   ```bash
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

## Usage

### Basic Usage

Run the MCP client to connect to all configured servers:

```bash
node build/index.js <server_name_or_path>
```

### Examples

**Connect to pre-configured servers:**

```bash
# Connect to Airbnb MCP server
npm run build
node build/index.js airbnb

# Connect to Calculator MCP server
node build/index.js calculate
```

**Connect to custom servers:**

```bash
# Connect to custom Python MCP server
node build/index.js path/to/server.py

# Connect to custom JavaScript MCP server
node build/index.js path/to/server.js

# Connect to HTTP MCP server
node build/index.js http://localhost:3000/mcp
```

### Interactive Commands

Once the client is running, you can use these commands:

- **Regular query:** Type your question directly
- **`sequential`:** Toggle sequential tool calling mode on/off
- **`parallel`:** Use parallel tool calling for the next query only
- **`seq <query>`:** Process a specific query with sequential mode
- **`quit`:** Exit the application

### Tool Execution Modes

**Parallel Mode (Default):**

- Executes multiple tools simultaneously when possible
- Faster execution for independent operations
- Best for queries that don't depend on each other

**Sequential Mode:**

- Executes tools one by one in order
- Useful when one tool's output is needed as input for another
- Better for complex, multi-step operations

## Configuration

### Adding New MCP Servers

Edit `mcp-servers.config.ts` to add new servers:

```typescript
export const MCP_SERVERS: MCPServersConfig = {
  your_server_name: {
    command: "npx",
    args: ["-y", "your-mcp-server-package"],
    description: "Description of your server",
    env: {
      CUSTOM_ENV_VAR: "value",
    },
  },
};
```

### Pre-configured Servers

The client comes with these pre-configured servers:

- **airbnb:** Search and get details for Airbnb listings
- **calculate:** Mathematical calculations and computations

## Project Structure

```
mcp_server_test/
├── index.ts                 # Main MCP client implementation
├── mcp-servers.config.ts    # Server configuration
├── package.json             # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── .env                    # Environment variables
└── build/                  # Compiled JavaScript output
```

## Development

### Development Mode

For continuous compilation during development:

```bash
npx tsc --watch
```

### Adding Dependencies

```bash
npm install <package-name>
# or for dev dependencies
npm install -D <package-name>
```

## Architecture

### Core Components

- **MCPClient class:** Main client handling server connections and Claude interactions
- **ConnectedServer interface:** Manages individual server connections and tools
- **Tool execution system:** Handles both parallel and sequential tool calling

### Connection Flow

1. Client initializes with Anthropic API key
2. Connects to specified MCP servers (stdio or HTTP)
3. Lists and aggregates available tools from all servers
4. Enters interactive chat loop with Claude
5. Routes tool calls to appropriate servers
6. Streams responses back to user

## Environment Variables

| Variable            | Required | Description                              |
| ------------------- | -------- | ---------------------------------------- |
| `ANTHROPIC_API_KEY` | Yes      | Your Anthropic API key for Claude access |

## Troubleshooting

### Common Issues

**"ANTHROPIC_API_KEY is not set"**

- Ensure you have created a `.env` file with your API key
- Verify the API key is valid and active

**"Server not found in configuration"**

- Check that the server name exists in `mcp-servers.config.ts`
- Ensure you're using the correct server name

**Tool execution errors**

- Verify the MCP server is properly installed and accessible
- Check server-specific environment variables are set correctly

### Getting Help

If you encounter issues:

1. Check the console output for detailed error messages
2. Verify all dependencies are installed correctly
3. Ensure your Anthropic API key has sufficient credits
4. Review the MCP server documentation for specific servers

## License

This project is licensed under the ISC License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Building MCP Clients Tutorial](https://modelcontextprotocol.io/tutorials/building-a-client)
