import { argv } from "node:process";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tlogStatusSchema } from "@tlog/shared";

export const MCP_SERVER_NAME = "tlog-mcp";
export const MCP_SERVER_VERSION = "0.1.0";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION
  });

  server.registerTool(
    "tlog_validate_status",
    {
      title: "Validate TLog status",
      description: "Validate that a status is one of todo/doing/done/blocked",
      inputSchema: {
        status: tlogStatusSchema
      }
    },
    async ({ status }) => {
      return {
        content: [
          {
            type: "text",
            text: `Status is valid: ${status}`
          }
        ]
      };
    }
  );

  return server;
}

export function hasStdioFlag(args: string[]): boolean {
  return args.includes("--stdio");
}

export async function startMcpServerStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function main(args: string[]): Promise<void> {
  if (!hasStdioFlag(args.slice(2))) {
    console.error("Usage: tlog-mcp --stdio");
    process.exitCode = 1;
    return;
  }

  await startMcpServerStdio();
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  main(argv).catch((error: unknown) => {
    console.error("Failed to start MCP server:", error);
    process.exitCode = 1;
  });
}
