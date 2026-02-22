import { Command, CommanderError } from "commander";
import { CliError, emitFailure, getGlobals } from "./core.js";
import { runInit, runTemplate, type InitOptions, type TemplateOptions } from "./commands/init-template.js";
import { runCaseCreate, runSuiteCreate, type CaseCreateOptions, type SuiteCreateOptions } from "./commands/suite-case.js";
import {
  runCaseList,
  runListTemplates,
  runSuiteList,
  runValidate,
  type CaseListOptions,
  type ListTemplatesOptions,
  type SuiteListOptions,
  type ValidateOptions
} from "./commands/validate-list.js";

export const cliVersion = "0.1.0";

export function initializeWorkspace(cwd: string): void {
  runInit(
    cwd,
    { output: "tests" },
    { dryRun: false, json: false, yes: true }
  );
}

function createProgram(): Command {
  const program = new Command();
  program.name("tlog").description("tlog CLI").version(cliVersion);

  program.option("--dry-run", "preview changes without writing files", false);
  program.option("--json", "print machine-readable JSON output", false);
  program.option("--yes", "skip interactive confirmation", false);

  program
    .command("init")
    .description("Initialize tests directory")
    .option("--template <dir>", "template directory")
    .option("--output <dir>", "output directory", "tests")
    .action((options: InitOptions, command: Command) => {
      runInit(process.cwd(), options, getGlobals(command));
    });

  program
    .command("template")
    .description("Create a reusable template directory")
    .option("--from <dir>", "extract from existing test directory")
    .option("--output <dir>", "output directory", "templates/default")
    .action((options: TemplateOptions, command: Command) => {
      runTemplate(process.cwd(), options, getGlobals(command));
    });

  const suite = program.command("suite").description("Suite operations");

  suite
    .command("create")
    .description("Create suite index.yaml")
    .requiredOption("--id <suiteId>", "suite id")
    .requiredOption("--title <suiteTitle>", "suite title")
    .option("--dir <dir>", "suite root directory", "tests")
    .option("--owners <a,b,c>", "owners list")
    .option("--tags <a,b,c>", "tags list")
    .option("--scheduled-start <YYYY-MM-DD>", "scheduled start date")
    .option("--scheduled-end <YYYY-MM-DD>", "scheduled end date")
    .action((options: SuiteCreateOptions, command: Command) => {
      runSuiteCreate(process.cwd(), options, getGlobals(command));
    });

  suite
    .command("list")
    .description("List suite files")
    .option("--dir <dir>", "search root", "tests")
    .option("--id <pattern>", "id filter")
    .option("--format <text|json|csv>", "output format", "text")
    .option("--output <path>", "write output to file")
    .action((options: SuiteListOptions, command: Command) => {
      runSuiteList(process.cwd(), options, getGlobals(command));
    });

  const testCase = program.command("case").description("Case operations");

  testCase
    .command("create")
    .description("Create a test case YAML")
    .requiredOption("--suite-dir <dir>", "target suite directory")
    .requiredOption("--id <caseId>", "case id")
    .requiredOption("--title <caseTitle>", "case title")
    .option("--status <todo|doing|done|null>", "case status")
    .option("--tags <a,b,c>", "tags list")
    .action((options: CaseCreateOptions, command: Command) => {
      runCaseCreate(process.cwd(), options, getGlobals(command));
    });

  testCase
    .command("list")
    .description("List test case files")
    .option("--dir <dir>", "search root", "tests")
    .option("--id <pattern>", "id filter")
    .option("--tag <tag>", "tag filter")
    .option("--status <todo|doing|done|null>", "status filter")
    .option("--format <text|json|csv>", "output format", "text")
    .option("--output <path>", "write output to file")
    .action((options: CaseListOptions, command: Command) => {
      runCaseList(process.cwd(), options, getGlobals(command));
    });

  const list = program.command("list").description("List resources");
  list
    .command("templates")
    .description("List available templates")
    .option("--dir <dir>", "templates directory", "templates")
    .option("--format <text|json|csv>", "output format", "text")
    .option("--output <path>", "write output to file")
    .action((options: ListTemplatesOptions, command: Command) => {
      runListTemplates(process.cwd(), options, getGlobals(command));
    });

  program
    .command("validate")
    .description("Validate YAML files under tests/")
    .option("--dir <dir>", "validation root", "tests")
    .option("--fail-on-warning", "treat warnings as failures", false)
    .option("--format <text|json>", "output format", "text")
    .action((options: ValidateOptions, command: Command) => {
      runValidate(process.cwd(), options, getGlobals(command));
    });

  return program;
}

export function runCli(argv: string[]): void {
  process.exitCode = 0;
  const program = createProgram();
  program.exitOverride();

  const commandName = argv.slice(2, 4).join(" ").trim() || "root";
  const jsonMode = argv.includes("--json") || (argv.includes("--format") && argv.includes("json"));

  try {
    program.parse(argv, { from: "node" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        process.exitCode = 0;
        return;
      }

      emitFailure(commandName, new CliError(error.message, { exitCode: error.exitCode }), jsonMode ? "json" : "text");
      process.exitCode = Number.isFinite(error.exitCode) ? Number(error.exitCode) : 1;
      return;
    }

    if (error instanceof CliError) {
      emitFailure(commandName, error, jsonMode ? "json" : "text");
      process.exitCode = error.exitCode;
      return;
    }

    throw error;
  }
}
