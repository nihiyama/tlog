import { describe, expect, it } from "vitest";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  createMcpServer,
  hasStdioFlag
} from "../src/index.js";

describe("MCP server", () => {
  it("creates server instance", () => {
    const server = createMcpServer();
    expect(server).toBeTruthy();
  });

  it("exposes expected server identity constants", () => {
    expect(MCP_SERVER_NAME).toBe("tlog-mcp");
    expect(MCP_SERVER_VERSION).toBe("0.1.0");
  });
});

describe("hasStdioFlag", () => {
  it("returns true when --stdio is passed", () => {
    expect(hasStdioFlag(["--stdio"])).toBe(true);
  });

  it("returns false when --stdio is missing", () => {
    expect(hasStdioFlag([])).toBe(false);
  });
});
