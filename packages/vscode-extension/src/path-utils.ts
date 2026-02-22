import { stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type * as vscode from "vscode";

export async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function pickRootPath(vscodeApi: typeof vscode): Promise<string | undefined> {
  const selected = await vscodeApi.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Select tlog root directory",
    title: "Select tlog root directory",
    defaultUri: vscodeApi.workspace.workspaceFolders?.[0]?.uri
      ? vscodeApi.Uri.file(join(vscodeApi.workspace.workspaceFolders[0].uri.fsPath))
      : undefined
  });

  return selected?.[0]?.fsPath;
}

export function isInsideRoot(rootDirectory: string, candidatePath: string): boolean {
  const rel = relative(rootDirectory, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}
