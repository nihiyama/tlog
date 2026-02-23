import { Command, CommanderError } from "commander";
import { CliError, emitFailure, getGlobals } from "./core.js";
import { runCaseDelete, runSuiteDelete, type DeleteOptions } from "./commands/delete.js";
import { runInit, runTemplate, type InitOptions, type TemplateOptions } from "./commands/init-template.js";
import { runRelatedList, runRelatedSync, type RelatedListOptions, type RelatedSyncOptions } from "./commands/related.js";
import { runCaseCreate, runSuiteCreate, type CaseCreateOptions, type SuiteCreateOptions } from "./commands/suite-case.js";
import { runSuiteStats, type SuiteStatsOptions } from "./commands/stats.js";
import { runCaseUpdate, runSuiteUpdate, type CaseUpdateOptions, type SuiteUpdateOptions } from "./commands/update.js";
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
    .command("update")
    .description("Update suite YAML by id")
    .requiredOption("--id <suiteId>", "suite id")
    .option("--dir <dir>", "search root directory", "tests")
    .option("--title <suiteTitle>", "suite title")
    .option("--description <text>", "suite description")
    .option("--tags <a,b,c>", "suite tags")
    .option("--owners <a,b,c>", "suite owners")
    .option("--related <a,b,c>", "related ids")
    .option("--remarks <a,b,c>", "suite remarks")
    .option("--scoped <true|false>", "suite scoped flag")
    .option("--scheduled-start <YYYY-MM-DD>", "scheduled start date")
    .option("--scheduled-end <YYYY-MM-DD>", "scheduled end date")
    .option("--actual-start <YYYY-MM-DD>", "actual start date")
    .option("--actual-end <YYYY-MM-DD>", "actual end date")
    .action((options: SuiteUpdateOptions, command: Command) => {
      runSuiteUpdate(process.cwd(), options, getGlobals(command));
    });

  suite
    .command("delete")
    .description("Delete suite by id")
    .requiredOption("--id <suiteId>", "suite id")
    .option("--dir <dir>", "search root directory", "tests")
    .action((options: DeleteOptions, command: Command) => {
      runSuiteDelete(process.cwd(), options, getGlobals(command));
    });

  suite
    .command("stats")
    .description("Show suite progress stats")
    .requiredOption("--id <suiteId>", "suite id")
    .option("--dir <dir>", "search root directory", "tests")
    .option("--format <text|json>", "output format", "text")
    .action((options: SuiteStatsOptions, command: Command) => {
      runSuiteStats(process.cwd(), options, getGlobals(command));
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
    .command("update")
    .description("Update case YAML by id")
    .requiredOption("--id <caseId>", "case id")
    .option("--dir <dir>", "search root directory", "tests")
    .option("--status <todo|doing|done|null>", "case status")
    .option("--tags <a,b,c>", "case tags")
    .option("--description <text>", "case description")
    .option("--operations <a,b,c>", "operations")
    .option("--related <a,b,c>", "related ids")
    .option("--remarks <a,b,c>", "remarks")
    .option("--scoped <true|false>", "case scoped flag")
    .option("--completed-day <YYYY-MM-DD|null>", "completion day")
    .option("--tests-file <path>", "JSON file path for tests array")
    .option("--issues-file <path>", "JSON file path for issues array")
    .action((options: CaseUpdateOptions, command: Command) => {
      runCaseUpdate(process.cwd(), options, getGlobals(command));
    });

  testCase
    .command("delete")
    .description("Delete case by id")
    .requiredOption("--id <caseId>", "case id")
    .option("--dir <dir>", "search root directory", "tests")
    .action((options: DeleteOptions, command: Command) => {
      runCaseDelete(process.cwd(), options, getGlobals(command));
    });

  testCase
    .command("list")
    .description("List test case files")
    .option("--dir <dir>", "search root", "tests")
    .option("--id <pattern>", "id filter")
    .option("--tag <tag>", "tag filter")
    .option("--owners <a,b,c>", "suite owners filter")
    .option("--scoped-only", "filter scoped=true only", false)
    .option("--issue-has <keyword>", "issue keyword filter")
    .option("--issue-status <open|doing|resolved|pending>", "issue status filter")
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

  const related = program.command("related").description("Related link operations");
  related
    .command("list")
    .description("List resolved/unresolved related links")
    .requiredOption("--id <id>", "source id")
    .option("--dir <dir>", "search root directory", "tests")
    .option("--format <text|json|csv>", "output format", "text")
    .action((options: RelatedListOptions, command: Command) => {
      runRelatedList(process.cwd(), options, getGlobals(command));
    });

  related
    .command("sync")
    .description("Sync reciprocal related links")
    .option("--dir <dir>", "search root directory", "tests")
    .option("--id <id>", "sync only specified source id")
    .action((options: RelatedSyncOptions, command: Command) => {
      runRelatedSync(process.cwd(), options, getGlobals(command));
    });

  program
    .command("validate")
    .description("Validate YAML files under tests/")
    .option("--dir <dir>", "validation root", "tests")
    .option("--fail-on-warning", "treat warnings as failures", false)
    .option("--watch", "watch changes and revalidate", false)
    .option("--watch-interval <ms>", "watch polling interval in milliseconds", "1000")
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
