export type LogLevel = "info" | "warn" | "error";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export interface NormalizationResult<T> {
  entity: T;
  warnings: string[];
}

export interface FileWriteResult {
  yamlText: string;
  writtenFile: string | null;
}

export interface PromptExtraction {
  id: string;
  title: string;
  warnings: string[];
}
