/** Join lines into n8n Code node jsCode (single source for string assembly). */
export function joinN8nJs(lines: string[]): string {
  return lines.join("\n");
}

export interface N8nCodeNodeContext {
  input?: Record<string, unknown>;
  allInputs?: Array<Record<string, unknown>>;
  nodeOutputs?: Record<string, Record<string, unknown>>;
  executionId?: string;
  staticData?: Record<string, unknown>;
  now?: number;
}

/** Run generated n8n Code node jsCode in tests (mocks $input, $, $execution, staticData). */
export function runN8nCodeNode(jsCode: string, context: N8nCodeNodeContext = {}): unknown {
  const inputJson = context.input ?? {};
  const allInputs = context.allInputs ?? [inputJson];
  const $input = {
    first: () => ({ json: inputJson }),
    all: () => allInputs.map((json) => ({ json })),
  };
  const $ = (nodeName: string) => {
    const json = context.nodeOutputs?.[nodeName] ?? {};
    return { first: () => ({ json }), item: { json } };
  };
  const $execution = { id: context.executionId ?? "test-execution" };
  const staticStore = context.staticData ?? {};
  const $getWorkflowStaticData = () => staticStore;
  const DateLike = context.now !== undefined ? { now: () => context.now! } : Date;

  const fn = new Function(
    "$input",
    "$",
    "$execution",
    "$getWorkflowStaticData",
    "console",
    "Buffer",
    "Date",
    jsCode
  );

  return fn(
    $input,
    $,
    $execution,
    $getWorkflowStaticData,
    { log: () => undefined },
    Buffer,
    DateLike
  );
}

/** First item json from a Code node return array, or undefined. */
export function firstCodeNodeJson(result: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(result) || result.length === 0) {
    return undefined;
  }
  const item = result[0];
  if (item === null || typeof item !== "object" || !("json" in item)) {
    return undefined;
  }
  const json = (item as { json?: unknown }).json;
  return json !== null && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : undefined;
}
