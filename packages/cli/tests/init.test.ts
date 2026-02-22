import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeWorkspace } from "../src/index.js";

describe("initializeWorkspace", () => {
  it("creates tests/index.yaml", () => {
    const dir = mkdtempSync(join(tmpdir(), "tlog-cli-"));
    initializeWorkspace(dir);

    const yaml = readFileSync(join(dir, "tests", "index.yaml"), "utf8");
    expect(yaml).toContain("suite: default");
    expect(yaml).toContain("cases: []");
  });
});
