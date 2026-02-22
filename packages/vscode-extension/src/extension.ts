type ExtensionContext = {
  subscriptions: { dispose(): unknown }[];
};

export async function activate(context: ExtensionContext): Promise<void> {
  const vscode = await import("vscode");
  const disposable = vscode.commands.registerCommand("tlog.hello", () => {
    void vscode.window.showInformationMessage("TLog extension is active.");
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  // no-op
}
