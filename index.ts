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

interface ConnectedServer {
  name: string;
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  tools: Tool[];
}

class MCPClient {
  private anthropic: Anthropic;
  private connectedServers: Map<string, ConnectedServer> = new Map();
  private allTools: Tool[] = [];
  private toolToServerMap: Map<string, string> = new Map();
  private enableSequentialToolCalls: boolean = false;
  private maxToolCallRounds: number = 5;

  constructor() {
    // Initialize Anthropic client
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
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

    // Check if already connected
    if (this.connectedServers.has(serverName)) {
      console.log(`Already connected to MCP server '${serverName}'`);
      return;
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

      // Create new client for this server
      const client = new Client({
        name: `mcp-client-${serverName}`,
        version: "1.0.0",
      });

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

      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: Object.keys(envVars).length > 0 ? envVars : undefined,
      });

      await client.connect(transport);
      console.log(`Successfully connected to MCP server '${serverName}'`);

      // List available tools
      const toolsResult = await client.listTools();
      const serverTools = toolsResult.tools.map((tool: any) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });

      // Store server connection
      const connectedServer: ConnectedServer = {
        name: serverName,
        client,
        transport,
        tools: serverTools,
      };

      this.connectedServers.set(serverName, connectedServer);

      // Update tool mappings
      serverTools.forEach((tool: any) => {
        this.toolToServerMap.set(tool.name, serverName);
      });

      // Rebuild aggregated tools list
      this.rebuildToolsList();

      console.log(
        `Added ${serverTools.length} tools from '${serverName}':`,
        serverTools.map(({ name }: any) => name)
      );
      console.log(`Total tools available: ${this.allTools.length}`);
    } catch (e) {
      console.log(`Failed to connect to MCP server '${serverName}':`, e);
      throw e;
    }
  }

  private rebuildToolsList() {
    /**
     * Rebuild the aggregated tools list from all connected servers
     */
    this.allTools = [];
    for (const server of this.connectedServers.values()) {
      this.allTools.push(...server.tools);
    }
  }

  async connectToMultipleServers(serverNames: string[]) {
    /**
     * Connect to multiple MCP servers simultaneously
     *
     * @param serverNames - Array of server names from MCP_SERVERS configuration
     */
    console.log(`Connecting to ${serverNames.length} MCP servers...`);

    const connectionPromises = serverNames.map((serverName) =>
      this.connectToMCPServer(serverName).catch((error) => {
        console.error(`Failed to connect to ${serverName}:`, error);
        return null;
      })
    );

    await Promise.all(connectionPromises);

    const connectedCount = this.connectedServers.size;
    console.log(
      `Successfully connected to ${connectedCount}/${serverNames.length} servers`
    );
    console.log(`Total tools available: ${this.allTools.length}`);
  }

  getConnectedServers(): string[] {
    /**
     * Get list of connected server names
     */
    return Array.from(this.connectedServers.keys());
  }

  getToolsFromServer(serverName: string): Tool[] {
    /**
     * Get tools from a specific server
     */
    const server = this.connectedServers.get(serverName);
    return server ? server.tools : [];
  }

  async connectToServerByPath(serverPath: string, serverName?: string) {
    /**
     * Connect to an MCP server using a file path or URL (legacy method)
     * This creates a temporary server configuration and connects to it
     *
     * @param serverPath - Path to the server script (.py or .js) or URL to HTTP server
     * @param serverName - Optional name for the server (defaults to path-based name)
     */
    const tempServerName = serverName || `server_${Date.now()}`;

    try {
      // Check if the serverPath is a URL
      const isUrl =
        serverPath.startsWith("http://") || serverPath.startsWith("https://");

      // Create new client for this server
      const client = new Client({
        name: `mcp-client-${tempServerName}`,
        version: "1.0.0",
      });
      let transport: StdioClientTransport | StreamableHTTPClientTransport;

      if (isUrl) {
        // Initialize HTTP transport and connect to server
        transport = new StreamableHTTPClientTransport(new URL(serverPath));
        await client.connect(transport);
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
        transport = new StdioClientTransport({
          command,
          args: [serverPath],
        });
        await client.connect(transport);
        console.log("Connected to MCP server via stdio:", serverPath);
      }

      // List available tools
      const toolsResult = await client.listTools();
      const serverTools = toolsResult.tools.map((tool: any) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });

      // Store server connection
      const connectedServer: ConnectedServer = {
        name: tempServerName,
        client,
        transport,
        tools: serverTools,
      };

      this.connectedServers.set(tempServerName, connectedServer);

      // Update tool mappings
      serverTools.forEach((tool: any) => {
        this.toolToServerMap.set(tool.name, tempServerName);
      });

      // Rebuild aggregated tools list
      this.rebuildToolsList();

      console.log(
        `Added ${serverTools.length} tools from '${tempServerName}':`,
        serverTools.map(({ name }: any) => name)
      );
      console.log(`Total tools available: ${this.allTools.length}`);
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(
    query: string,
    options: { sequential?: boolean; maxRounds?: number } = {}
  ) {
    /**
     * Process a query using Claude and available tools
     *
     * @param query - The user's input query
     * @param options - Processing options including sequential mode and max rounds
     * @returns Processed response as a string
     */
    // Extract options
    const sequential = options.sequential ?? this.enableSequentialToolCalls;
    const maxRounds = options.maxRounds ?? this.maxToolCallRounds;

    const messages: MessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    // console.log(JSON.stringify(messages, null, 2));

    // Choose system prompt based on mode
    const systemPrompt = sequential
      ? "Use tools sequentially when the output of one tool is needed as input for another. Use parallel tool calls only when operations are independent."
      : "<use_parallel_tool_calls>Invoke tools simultaneously whenever possible.</use_parallel_tool_calls>";

    // Initial Claude API call
    let response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages,
      tools: this.allTools,
      system: systemPrompt,
    });

    // console.log(JSON.stringify(response.content, null, 2));

    // Handle tool calls in a loop for sequential chaining
    let currentResponse = response;
    let roundCount = 0;
    const allTextContent: string[] = [];

    while (roundCount < maxRounds) {
      // Process current response and collect text/tool calls
      const textContent: string[] = [];
      const toolCalls: any[] = [];

      // First pass: collect all text and tool calls from current response
      for (const content of currentResponse.content) {
        if (content.type === "text") {
          textContent.push(content.text);
        } else if (content.type === "tool_use") {
          toolCalls.push(content);
        }
      }

      // Collect text content from this round
      if (textContent.length > 0) {
        allTextContent.push(textContent.join("\n"));
      }

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        break;
      }

      console.log(`\n=== Tool Call Round ${roundCount + 1} ===`);
      console.log(`Found ${toolCalls.length} tool call(s)`);

      // Add the assistant's response with tool calls to message history
      messages.push({
        role: "assistant",
        content: currentResponse.content,
      });

      // console.log(JSON.stringify(messages, null, 2));

      // Execute tool calls (parallel or sequential based on mode)
      let toolResults: any[];

      if (sequential && toolCalls.length > 1) {
        // Sequential execution: execute one by one
        console.log("Executing tools sequentially...");
        toolResults = [];
        for (const toolCall of toolCalls) {
          const result = await this.executeSingleTool(toolCall);
          toolResults.push(result);
          // console.log(`Completed tool: ${toolCall.name}`);
        }
      } else {
        // Parallel execution: execute all at once
        console.log("Executing tools in parallel...");
        const toolPromises = toolCalls.map((toolCall) =>
          this.executeSingleTool(toolCall)
        );
        toolResults = await Promise.all(toolPromises);
      }

      // console.log("toolResults: ", JSON.stringify(toolResults, null, 2));

      // Send all tool results in a single user message
      messages.push({
        role: "user",
        content: toolResults,
      });

      // console.log(JSON.stringify(messages, null, 2));

      // Get Claude's next response
      currentResponse = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages,
        tools: this.allTools,
        system: systemPrompt,
      });

      // console.log(
      //   "currentResponse.content: ",
      //   JSON.stringify(currentResponse.content, null, 2)
      // );
      roundCount++;
    }

    // Collect final text content
    const finalTextContent: string[] = [];
    for (const content of currentResponse.content) {
      if (content.type === "text") {
        finalTextContent.push(content.text);
      }
    }

    if (finalTextContent.length > 0) {
      allTextContent.push(finalTextContent.join("\n"));
    }

    if (roundCount >= maxRounds) {
      console.log(`\n⚠️  Reached maximum tool call rounds (${maxRounds})`);
    }

    return allTextContent.join("\n\n");
  }

  private async executeSingleTool(toolCall: any) {
    /**
     * Execute a single tool call and return the formatted result
     * Routes the tool call to the correct MCP server
     *
     * @param toolCall - The tool call object from Claude's response
     * @returns Formatted tool result for Claude
     */
    try {
      // Find which server has this tool
      const serverName = this.toolToServerMap.get(toolCall.name);
      if (!serverName) {
        throw new Error(
          `Tool '${toolCall.name}' not found in any connected server`
        );
      }

      const server = this.connectedServers.get(serverName);
      if (!server) {
        throw new Error(`Server '${serverName}' not connected`);
      }

      console.log(
        `Executing tool '${toolCall.name}' on server '${serverName}'`
      );

      const result = await server.client.callTool({
        name: toolCall.name,
        arguments: toolCall.input as { [x: string]: unknown } | undefined,
      });
      console.log(JSON.stringify(result, null, 2));

      // Extract the actual content from MCP result
      let content: string;
      if (typeof result.content === "string") {
        content = result.content;
      } else if (result.content && typeof result.content === "object") {
        // Handle different MCP result formats
        content = JSON.stringify(result.content);
      } else {
        // Fallback: stringify the entire result
        content = JSON.stringify(result);
      }

      return {
        type: "tool_result" as const,
        tool_use_id: toolCall.id,
        content: content,
      };
    } catch (error) {
      console.log(error);
      return {
        type: "tool_result" as const,
        tool_use_id: toolCall.id,
        content: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  enableSequentialMode(enabled: boolean = true, maxRounds: number = 5) {
    /**
     * Enable or disable sequential tool calling mode
     *
     * @param enabled - Whether to enable sequential mode
     * @param maxRounds - Maximum number of tool call rounds
     */
    this.enableSequentialToolCalls = enabled;
    this.maxToolCallRounds = maxRounds;
    console.log(`Sequential tool calls: ${enabled ? "ENABLED" : "DISABLED"}`);
    if (enabled) {
      console.log(`Max tool call rounds: ${maxRounds}`);
    }
  }

  async processQuerySequential(query: string, maxRounds: number = 5) {
    /**
     * Process a query with sequential tool calling enabled
     *
     * @param query - The user's input query
     * @param maxRounds - Maximum number of tool call rounds
     * @returns Processed response as a string
     */
    return this.processQuery(query, { sequential: true, maxRounds });
  }

  async processQueryParallel(query: string) {
    /**
     * Process a query with parallel tool calling (original behavior)
     *
     * @param query - The user's input query
     * @returns Processed response as a string
     */
    return this.processQuery(query, { sequential: false, maxRounds: 1 });
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
      console.log("Available commands:");
      console.log("  - Type your query for normal processing");
      console.log(
        "  - Type 'sequential' to toggle sequential tool calling mode"
      );
      console.log(
        "  - Type 'parallel' to use parallel tool calling for next query"
      );
      console.log(
        "  - Type 'seq <query>' to process query with sequential mode"
      );
      console.log("  - Type 'quit' to exit");
      console.log(
        `\nCurrent mode: ${
          this.enableSequentialToolCalls ? "SEQUENTIAL" : "PARALLEL"
        }`
      );

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }

        if (message.toLowerCase() === "sequential") {
          this.enableSequentialMode(!this.enableSequentialToolCalls);
          continue;
        }

        if (message.toLowerCase() === "parallel") {
          console.log("Next query will use parallel mode");
          const nextMessage = await rl.question("Query (parallel): ");
          try {
            const response = await this.processQueryParallel(nextMessage);
            console.log("\n" + response);
          } catch (error) {
            console.error("Error processing parallel query:", error);
          }
          continue;
        }

        if (message.toLowerCase().startsWith("seq ")) {
          const query = message.substring(4);
          console.log("Processing with sequential mode...");
          try {
            const response = await this.processQuerySequential(query);
            console.log("\n" + response);
          } catch (error) {
            console.error("Error processing sequential query:", error);
          }
          continue;
        }

        try {
          const response = await this.processQuery(message);
          console.log("\n" + response);
        } catch (error) {
          console.error("Error processing query:", error);
        }
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    /**
     * Clean up resources - close all server connections
     */
    console.log("Cleaning up MCP server connections...");

    const closePromises = Array.from(this.connectedServers.values()).map(
      async (server) => {
        try {
          await server.client.close();
          console.log(`Closed connection to server: ${server.name}`);
        } catch (error) {
          console.error(`Error closing connection to ${server.name}:`, error);
        }
      }
    );

    await Promise.all(closePromises);

    // Clear all data structures
    this.connectedServers.clear();
    this.allTools = [];
    this.toolToServerMap.clear();

    console.log("All MCP server connections closed");
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
    // Connect to multiple servers from configuration
    const serverNames = Object.keys(MCP_SERVERS);
    console.log(`Available servers: ${serverNames.join(", ")}`);

    // You can connect to specific servers or all of them
    // Example: Connect to specific servers
    // await client.connectToMultipleServers(['airbnb', 'calculate']);

    // Or connect to all configured servers
    await mcpClient.connectToMultipleServers(serverNames);

    // Alternative: Connect to a server by path (legacy method)
    // await client.connectToServerByPath(serverPath);

    // Start the interactive chat loop
    await mcpClient.chatLoop();
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
