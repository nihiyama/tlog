export type TlogErrorCode = "validation" | "conflict" | "io" | "security";

export interface TlogWarning {
  code: string;
  message: string;
  path?: string;
}

export interface TlogError {
  code: TlogErrorCode;
  message: string;
  path?: string;
  cause?: unknown;
}

export type Result<T, E = TlogError> =
  | { ok: true; data: T; warnings: TlogWarning[] }
  | { ok: false; error: E; warnings: TlogWarning[] };

export function ok<T>(data: T, warnings: TlogWarning[] = []): Result<T> {
  return { ok: true, data, warnings };
}

export function err<E = TlogError>(error: E, warnings: TlogWarning[] = []): Result<never, E> {
  return { ok: false, error, warnings };
}

export function serializeResult<T, E>(result: Result<T, E>): string {
  return JSON.stringify(result, null, 2);
}
