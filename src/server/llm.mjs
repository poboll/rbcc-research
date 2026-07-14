const DEFAULT_BASE_URL = "https://api.deepseek.com";

export function llmStatus() {
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
  return {
    configured: Boolean(process.env.DEEPSEEK_API_KEY),
    provider: "DeepSeek",
    model,
    reportModel: process.env.DEEPSEEK_REPORT_MODEL ?? model,
    reportBlockMaxTokens: Number(process.env.REPORT_BLOCK_MAX_TOKENS ?? 3200),
    reportPartMaxTokens: Number(process.env.REPORT_PART_MAX_TOKENS ?? 2800)
  };
}

export async function complete(messages, options = {}) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const baseUrl = (process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: options.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      messages,
      temperature: options.temperature ?? 0.35,
      max_tokens: options.maxTokens ?? 1800,
      stream: false
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 90_000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`DeepSeek HTTP ${response.status}: ${detail}`);
  }
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content?.trim() || null;
}

export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try { return JSON.parse(candidate); } catch { return null; }
}
