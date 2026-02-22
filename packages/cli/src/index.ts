import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command, CommanderError } from "commander";
import { defaultTlogSuite, tlogSuiteSchema } from "@tlog/shared";

export const cliVersion = "0.1.0";

function initWorkspace(cwd: string): void {
  const testsDir = join(cwd, "tests");
  const indexYamlPath = join(testsDir, "index.yaml");
  mkdirSync(testsDir, { recursive: true });

  if (existsSync(indexYamlPath)) {
    console.log("Already exists:", indexYamlPath);
    return;
  }

  const suite = tlogSuiteSchema.parse(defaultTlogSuite);
  const initialYaml = [
    `suite: ${suite.suite}`,
    `description: ${suite.description}`,
    `cases: [${suite.cases.join(", ")}]`,
    ""
  ].join("\n");

  writeFileSync(indexYamlPath, initialYaml, "utf8");
  console.log("Created:", indexYamlPath);
}

export function initializeWorkspace(cwd: string): void {
  initWorkspace(cwd);
}

function createProgram(): Command {
  const program = new Command();
  program.name("tlog").description("tlog CLI").version(cliVersion);

  program
    .command("init")
    .description("Initialize tests/index.yaml in current directory")
    .action(() => {
      initializeWorkspace(process.cwd());
    });

  return program;
}

export function runCli(argv: string[]): void {
  const program = createProgram();
  program.exitOverride();
  try {
    program.parse(argv, { from: "node" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        process.exitCode = 0;
        return;
      }
      process.exitCode = Number.isFinite(error.exitCode) ? Number(error.exitCode) : 1;
      return;
    }
    throw error;
  }
}
