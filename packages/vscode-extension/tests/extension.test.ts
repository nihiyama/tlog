import { beforeEach, describe, expect, it, vi } from "vitest";

const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
const showInformationMessage = vi.fn();

vi.mock(
  "vscode",
  () => ({
    commands: {
      registerCommand
    },
    window: {
      showInformationMessage
    }
  }),
  { virtual: true }
);

import { activate, deactivate } from "../src/extension.js";

describe("extension lifecycle", () => {
  beforeEach(() => {
    registerCommand.mockClear();
    showInformationMessage.mockClear();
  });

  it("registers tlog command on activate", async () => {
    const context = { subscriptions: [] as { dispose(): unknown }[] };
    await activate(context);
    expect(registerCommand).toHaveBeenCalledWith("tlog.hello", expect.any(Function));
    expect(context.subscriptions).toHaveLength(1);
  });

  it("exports deactivate", () => {
    expect(typeof deactivate).toBe("function");
  });
});
