const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_CHAT_TIMEOUT_MS = 90000;

const PROVIDERS = [
  {
    id: "heuristic",
    label: "Local heuristics",
    endpoint: "",
    description: "Internal fallback with no external model dependency.",
  },
  {
    id: "ollama",
    label: "Local Ollama",
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    discovery: "ollama",
    description: "Models downloaded and served locally through Ollama.",
  },
  {
    id: "lm-studio",
    label: "Local LM Studio",
    endpoint: "http://127.0.0.1:1234/v1",
    discovery: "openai",
    description: "Models loaded locally in LM Studio through its OpenAI-compatible server.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    requiresApiKey: true,
    description: "Hosted routing across many commercial and free-to-try models.",
  },
  {
    id: "groq",
    label: "Groq",
    endpoint: "https://api.groq.com/openai/v1",
    requiresApiKey: true,
    description: "Hosted OpenAI-compatible inference with supported Groq models.",
  },
  {
    id: "together",
    label: "Together AI",
    endpoint: "https://api.together.xyz/v1",
    requiresApiKey: true,
    description: "Hosted access to open-weight models through a compatible API.",
  },
  {
    id: "hugging-face",
    label: "Hugging Face Inference Providers",
    endpoint: "https://router.huggingface.co/v1",
    requiresApiKey: true,
    description: "Hosted inference providers for models available through Hugging Face.",
  },
  {
    id: "openai-compatible",
    label: "Custom OpenAI-compatible endpoint",
    endpoint: "",
    description: "Any local or remote chat-completions server, including self-hosted runtimes.",
  },
];

async function getAiProviderStatus() {
  const catalog = await Promise.all(PROVIDERS.map(async (definition) => {
    if (definition.discovery === "ollama") {
      const discovered = await probeOllama().catch((error) => ({
        available: false,
        models: [],
        error: error.message,
      }));
      return { ...definition, ...discovered };
    }

    if (definition.discovery === "openai") {
      const discovered = await probeOpenAiCompatibleModels(definition.endpoint).catch((error) => ({
        available: false,
        models: [],
        error: error.message,
      }));
      return { ...definition, ...discovered };
    }

    return {
      ...definition,
      available: true,
      models: [],
      error: null,
    };
  }));

  return { providers: catalog };
}

async function probeOllama() {
  const response = await fetchWithTimeout(`${DEFAULT_OLLAMA_ENDPOINT}/api/tags`, {
    headers: { Accept: "application/json" },
  }, 3500);

  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}.`);
  }

  const payload = await response.json();
  return {
    available: true,
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    models: (payload.models || []).map((model) => ({
      name: model.name,
      family: model.details?.family || "",
      parameterSize: model.details?.parameter_size || "",
      quantization: model.details?.quantization_level || "",
      contextLength: model.details?.context_length || null,
    })),
    error: null,
  };
}

async function probeOpenAiCompatibleModels(endpoint) {
  const response = await fetchWithTimeout(`${trimTrailingSlash(endpoint)}/models`, {
    headers: { Accept: "application/json" },
  }, 3500);

  if (!response.ok) {
    throw new Error(`Local endpoint returned status ${response.status}.`);
  }

  const payload = await response.json();
  return {
    available: true,
    models: (payload.data || []).map((model) => ({
      name: model.id || model.name || "",
      family: model.owned_by || "",
      parameterSize: "",
    })).filter((model) => model.name),
    error: null,
  };
}

function normalizeAiConfig(rawConfig = {}) {
  const provider = String(rawConfig.provider || "heuristic");
  const definition = PROVIDERS.find((candidate) => candidate.id === provider) || PROVIDERS[0];
  const endpoint = String(rawConfig.endpoint || definition.endpoint || "").trim();
  const model = String(rawConfig.model || "").trim();
  const apiKey = String(rawConfig.apiKey || "").trim();

  if (definition.id === "heuristic") {
    return {
      provider: definition.id,
      endpoint: "",
      model: "",
      apiKey: "",
      enabled: false,
      label: definition.label,
    };
  }

  const hasRequiredCredentials = !definition.requiresApiKey || Boolean(apiKey);
  return {
    provider: definition.id,
    endpoint,
    model,
    apiKey,
    enabled: Boolean(endpoint && model && hasRequiredCredentials),
    label: model ? `${definition.label} / ${model}` : `${definition.label} (no model selected)`,
  };
}

async function requestStructuredJson({ aiConfig, systemPrompt, userPrompt, timeoutMs = DEFAULT_CHAT_TIMEOUT_MS }) {
  const normalized = normalizeAiConfig(aiConfig);
  assertConfigured(normalized);
  const rawText = await requestProviderChat({
    normalized,
    systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    expectJson: true,
    timeoutMs,
  });
  return parseJsonResponse(rawText);
}

async function requestTextResponse({ aiConfig, systemPrompt, messages, timeoutMs = DEFAULT_CHAT_TIMEOUT_MS }) {
  const normalized = normalizeAiConfig(aiConfig);
  assertConfigured(normalized);
  const rawText = await requestProviderChat({ normalized, systemPrompt, messages, expectJson: false, timeoutMs });
  const reply = String(rawText || "").trim();
  if (!reply) throw new Error("The model did not return useful content.");
  return reply;
}

function assertConfigured(normalized) {
  if (!normalized.enabled) {
    throw new Error("Select a model, configure its endpoint, and provide a required API key before using this provider.");
  }
}

async function requestProviderChat({ normalized, systemPrompt, messages, expectJson, timeoutMs }) {
  const normalizedMessages = sanitizeChatMessages(messages);
  if (!normalizedMessages.length) throw new Error("No messages were sent to the model.");

  if (normalized.provider === "ollama") {
    return requestOllamaChat({ normalized, systemPrompt, messages: normalizedMessages, expectJson, timeoutMs });
  }

  return requestOpenAiCompatibleChat({ normalized, systemPrompt, messages: normalizedMessages, timeoutMs });
}

function sanitizeChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => ({
    role: normalizeRole(message?.role),
    content: String(message?.content || "").trim(),
  })).filter((message) => message.content);
}

function normalizeRole(role) {
  return role === "assistant" || role === "system" ? role : "user";
}

async function requestOllamaChat({ normalized, systemPrompt, messages, expectJson, timeoutMs }) {
  let response;
  try {
    response = await fetchWithTimeout(`${trimTrailingSlash(normalized.endpoint)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: normalized.model,
        stream: false,
        format: expectJson ? "json" : undefined,
        options: { temperature: expectJson ? 0.2 : 0.35 },
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    }, timeoutMs);
  } catch (error) {
    throw wrapTimeoutError(error, normalized.label, timeoutMs);
  }

  if (!response.ok) throw new Error(`Failed to query Ollama (${response.status}). ${await safeReadText(response)}`.trim());
  const payload = await response.json();
  return payload.message?.content || "";
}

async function requestOpenAiCompatibleChat({ normalized, systemPrompt, messages, timeoutMs }) {
  const headers = { "Content-Type": "application/json" };
  if (normalized.apiKey) headers.Authorization = `Bearer ${normalized.apiKey}`;

  let response;
  try {
    response = await fetchWithTimeout(`${trimTrailingSlash(normalized.endpoint)}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: normalized.model,
        temperature: 0.35,
        response_format: undefined,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    }, timeoutMs);
  } catch (error) {
    throw wrapTimeoutError(error, normalized.label, timeoutMs);
  }

  if (!response.ok) throw new Error(`Failed to query ${normalized.label} (${response.status}). ${await safeReadText(response)}`.trim());
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content || "";
}

function parseJsonResponse(text) {
  const normalized = String(text || "").trim();
  if (!normalized) throw new Error("The model did not return useful content.");
  try { return JSON.parse(normalized); } catch (error) {
    const fenced = normalized.match(/```json\s*([\s\S]*?)```/i) || normalized.match(/```\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1].trim());
    const object = normalized.match(/\{[\s\S]*\}/);
    if (object) return JSON.parse(object[0]);
    throw new Error("The model response was not valid JSON.");
  }
}

function trimTrailingSlash(value) { return value.replace(/\/+$/, ""); }

async function safeReadText(response) {
  try { return (await response.text()).trim(); } catch (error) { return ""; }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); }
}

function wrapTimeoutError(error, providerLabel, timeoutMs) {
  if (error?.name === "AbortError") return new Error(`${providerLabel} timed out after ${Math.max(1, Math.round(timeoutMs / 1000))}s.`);
  return error;
}

module.exports = {
  DEFAULT_OLLAMA_ENDPOINT,
  DEFAULT_CHAT_TIMEOUT_MS,
  PROVIDERS,
  getAiProviderStatus,
  normalizeAiConfig,
  requestStructuredJson,
  requestTextResponse,
};
