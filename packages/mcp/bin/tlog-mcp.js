#!/usr/bin/env node
import { main } from "../dist/index.js";

main(process.argv).catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exitCode = 1;
});
