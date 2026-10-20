/**
 * A provider agnostic AI client.
 *
 * When `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) is configured the prompt is
 * sent to that provider. Without a key the helper explains what to do
 * instead of failing silently, so the feature can be shipped before the
 * provider is chosen.
 */

export type AiTask =
  | "improve"
  | "shorten"
  | "summarize"
  | "continue"
  | "translate";

export interface AiRequest {
  task: AiTask;
  text: string;
  /** The language for the translation task. */
  language?: string;
}

export interface AiResult {
  text: string;
  provider: "anthropic" | "openai" | "none";
}

const PROMPTS: Record<AiTask, string> = {
  improve:
    "Rewrite the following text so that it is clearer and better written. Keep the meaning, the language and roughly the same length. Answer with the rewritten text only.",
  shorten:
    "Shorten the following text to about half of its length without losing the important information. Answer with the shortened text only.",
  summarize:
    "Summarize the following text in a short paragraph. Answer with the summary only.",
  continue:
    "Continue the following text in the same voice and style for two or three sentences. Answer with the continuation only.",
  translate:
    "Translate the following text into {language}. Answer with the translation only.",
};

export const buildPrompt = (request: AiRequest) =>
  (PROMPTS[request.task] ?? PROMPTS.improve).replace(
    "{language}",
    request.language ?? "English",
  ) + `\n\n---\n${request.text}`;

/**
 * Sends a prompt to the configured provider.
 */
export const runAiTask = async (request: AiRequest): Promise<AiResult> => {
  const prompt = buildPrompt(request);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `The AI provider answered with ${response.status}: ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (payload.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    return { text, provider: "anthropic" };
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `The AI provider answered with ${response.status}: ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = (payload.choices?.[0]?.message?.content ?? "").trim();
    return { text, provider: "openai" };
  }

  throw new Error(
    "No AI provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment to enable the assistant.",
  );
};

/** The label of the tasks in the UI. */
export const AI_TASK_LABELS: Record<AiTask, string> = {
  improve: "Improve writing",
  shorten: "Make shorter",
  summarize: "Summarize",
  continue: "Continue writing",
  translate: "Translate",
};
