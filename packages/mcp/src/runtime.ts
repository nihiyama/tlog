import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

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
