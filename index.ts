import { Anthropic } from "@anthropic-ai/sdk";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import readline from "readline/promises";

import dotenv from "dotenv";
import {
  MCP_SERVERS,
  MCPServerConfig,
  MCPServersConfig,
} from "./mcp-servers.config.js";

dotenv.config(); // load environment variables from .env

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

class MCPClient {
  private mcp: Client;
  private anthropic: Anthropic;
  private transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | null = null;
  private tools: Tool[] = [];

  constructor() {
    // Initialize Anthropic client and MCP client
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async connectToMCPServer(serverName: string) {
    /**
     * Connect to a configured MCP server by name
     *
     * @param serverName - Name of the server from MCP_SERVERS configuration
     */
    const serverConfig = MCP_SERVERS[serverName];
    if (!serverConfig) {
      throw new Error(
        `MCP server '${serverName}' not found in configuration. Available servers: ${Object.keys(
          MCP_SERVERS
        ).join(", ")}`
      );
    }

    try {
      console.log(
        `Connecting to MCP server '${serverName}' with command: ${
          serverConfig.command
        } ${serverConfig.args.join(" ")}`
      );

      // Check if the server has environment variables configured
      if (serverConfig.env) {
        console.log(
          `Using environment variables for '${serverName}':`,
          Object.keys(serverConfig.env)
        );
      }

      // Initialize stdio transport with the configured command, args, and environment variables
      const envVars: Record<string, string> = {};

      // Add current process environment variables (filtering out undefined values)
      if (process.env) {
        Object.entries(process.env).forEach(([key, value]) => {
          if (value !== undefined) {
            envVars[key] = value;
          }
        });
      }

      // Add server-specific environment variables
      if (serverConfig.env) {
        Object.entries(serverConfig.env).forEach(([key, value]) => {
          envVars[key] = value;
        });
      }

      this.transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: Object.keys(envVars).length > 0 ? envVars : undefined,
      });

      await this.mcp.connect(this.transport);
      console.log(`Successfully connected to MCP server '${serverName}'`);

      // List available tools
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      console.log(
        "Available tools:",
        this.tools.map(({ name }) => name)
      );
    } catch (e) {
      console.log(`Failed to connect to MCP server '${serverName}':`, e);
      throw e;
    }
  }

  async connectToServer(serverPath: string) {
    /**
     * Connect to an MCP server using a file path or URL
     *
     * @param serverPath - Path to the server script (.py or .js) or URL to HTTP server
     */
    try {
      // Check if the serverPath is a URL
      const isUrl =
        serverPath.startsWith("http://") || serverPath.startsWith("https://");

      if (isUrl) {
        // Initialize HTTP transport and connect to server
        this.transport = new StreamableHTTPClientTransport(new URL(serverPath));
        await this.mcp.connect(this.transport);
        console.log("Connected to MCP server via HTTP:", serverPath);
      } else {
        // Handle script-based server connection (stdio)
        const isJs = serverPath.endsWith(".js");
        const isPy = serverPath.endsWith(".py");
        if (!isJs && !isPy) {
          throw new Error("Server script must be a .js or .py file");
        }
        const command = isPy
          ? process.platform === "win32"
            ? "python"
            : "python3"
          : process.execPath;

        // Initialize stdio transport and connect to server
        this.transport = new StdioClientTransport({
          command,
          args: [serverPath],
        });
        await this.mcp.connect(this.transport);
        console.log("Connected to MCP server via stdio:", serverPath);
      }

      // List available tools
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      console.log(
        "Available tools:",
        this.tools.map(({ name }) => name)
        // this.tools.map(({ description }) => description),
        // this.tools.map(({ input_schema }) => input_schema)
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(query: string) {
    /**
     * Process a query using Claude and available tools
     *
     * @param query - The user's input query
     * @returns Processed response as a string
     */
    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    // Initial Claude API call
    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages,
      tools: this.tools,
    });

    // Process response and handle tool calls
    const finalText = [];
    const toolResults = [];

    for (const content of response.content) {
      if (content.type === "text") {
        finalText.push(content.text);
      } else if (content.type === "tool_use") {
        // Execute tool call
        const toolName = content.name;
        const toolArgs = content.input as { [x: string]: unknown } | undefined;

        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        toolResults.push(result);
        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
        );

        // Continue conversation with tool results
        messages.push({
          role: "user",
          content: result.content as string,
        });

        // Get next response from Claude
        const response = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          messages,
        });

        finalText.push(
          response.content[0].type === "text" ? response.content[0].text : ""
        );
      }
    }

    return finalText.join("\n");
  }

  async chatLoop() {
    /**
     * Run an interactive chat loop
     */
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    /**
     * Clean up resources
     */
    await this.mcp.close();
  }
}

async function main() {
  if (process.argv.length < 3) {
    console.log("Usage: node build/index.js <server_name_or_path>");
    console.log("\nConfigured MCP Servers:");
    Object.keys(MCP_SERVERS).forEach((serverName) => {
      const config = MCP_SERVERS[serverName];
      let serverInfo = `  ${serverName}: ${config.command} ${config.args.join(
        " "
      )}`;

      // Add environment variables info if present
      if (config.env) {
        const envVars = Object.keys(config.env).join(", ");
        serverInfo += ` (with env: ${envVars})`;
      }

      // Add description if present
      if (config.description) {
        serverInfo += `\n    Description: ${config.description}`;
      }

      console.log(serverInfo);
    });
    console.log("\nExamples:");
    console.log(
      "  node build/index.js airbnb                    # Connect to Airbnb MCP server"
    );
    console.log(
      "  node build/index.js path/to/server.py         # Connect to custom Python server"
    );
    console.log(
      "  node build/index.js http://localhost:3000/mcp # Connect to HTTP server"
    );
    return;
  }

  const serverNameOrPath = process.argv[2];
  const mcpClient = new MCPClient();

  try {
    // Check if the argument is a configured server name
    if (MCP_SERVERS[serverNameOrPath]) {
      console.log(`Using configured MCP server: ${serverNameOrPath}`);
      await mcpClient.connectToMCPServer(serverNameOrPath);
    } else {
      console.log(`Connecting to MCP server at path/URL: ${serverNameOrPath}`);
      await mcpClient.connectToServer(serverNameOrPath);
    }

    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
