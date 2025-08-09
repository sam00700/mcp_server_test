/**
 * MCP Server Configuration
 *
 * This file contains the configuration for all MCP servers.
 * You can easily modify, add, or remove servers by editing this file.
 */

export interface MCPServerConfig {
  command: string;
  args: string[];
  description?: string;
  env?: Record<string, string>;
}

export interface MCPServersConfig {
  [serverName: string]: MCPServerConfig;
}

/**
 * Configured MCP Servers
 *
 * To add a new server:
 * 1. Add a new entry to this object
 * 2. Specify the command and args needed to run the server
 * 3. Optionally add a description
 *
 * To modify the Airbnb server:
 * - Change the args array to add/remove flags
 * - For example, remove "--ignore-robots-txt" if you want to respect robots.txt
 */
export const MCP_SERVERS: MCPServersConfig = {
  airbnb: {
    command: "npx",
    args: ["-y", "@openbnb/mcp-server-airbnb", "--ignore-robots-txt"],
    description:
      "Airbnb search and listing details server with robots.txt ignored",
  },

  calculate: {
    command: "npx",
    args: ["-y", "calculate-mcp-server"],
  },

  // Example of Airbnb server without ignoring robots.txt
  // airbnb_respectful: {
  //   command: "npx",
  //   args: ["-y", "@openbnb/mcp-server-airbnb"],
  //   description: "Airbnb search and listing details server respecting robots.txt"
  // },

  // Example of other MCP servers you might want to add:
  // filesystem: {
  //   command: "npx",
  //   args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
  //   description: "Filesystem access server"
  // },

  // sqlite: {
  //   command: "npx",
  //   args: ["-y", "@modelcontextprotocol/server-sqlite", "/path/to/database.db"],
  //   description: "SQLite database server"
  // },

  // github: {
  //   command: "npx",
  //   args: ["-y", "@modelcontextprotocol/server-github"],
  //   description: "GitHub API server"
  // }
};
