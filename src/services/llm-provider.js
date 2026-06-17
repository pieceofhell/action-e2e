const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_OPENAI_COMPAT_ENDPOINT = "https://openrouter.ai/api/v1";
const DEFAULT_CHAT_TIMEOUT_MS = 90000;

async function getAiProviderStatus() {
  const ollama = await probeOllama().catch((error) => ({
    available: false,
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    models: [],
    error: error.message,
  }));

  return {
    providers: [
      {
        id: "heuristic",
        label: "Local heuristics",
        available: true,
        description: "Internal fallback with no external model dependency. Keeps the prototype working even without a generative provider.",
      },
      {
        id: "ollama",
        label: "Local Ollama",
        available: ollama.available,
        endpoint: ollama.endpoint,
        models: ollama.models,
        error: ollama.error || null,
        description: "Uses models served locally by Ollama, such as llama3.1, mistral, or any other model already downloaded.",
      },
      {
        id: "openai-compatible",
        label: "OpenAI-compatible endpoint",
        available: true,
        endpoint: DEFAULT_OPENAI_COMPAT_ENDPOINT,
        models: [],
        description: "Supports local or remote servers compatible with the chat completions API.",
      },
    ],
  };
}

async function probeOllama() {
  const response = await fetchWithTimeout(`${DEFAULT_OLLAMA_ENDPOINT}/api/tags`, {
    headers: {
      Accept: "application/json",
    },
  }, 3500);

  if (!response.ok) {
    throw new Error(`Ollama returned status ${response.status}.`);
  }

  const payload = await response.json();
  const models = (payload.models || []).map((model) => ({
    name: model.name,
    family: model.details?.family || "",
    parameterSize: model.details?.parameter_size || "",
    quantization: model.details?.quantization_level || "",
    contextLength: model.details?.context_length || null,
  }));

  return {
    available: true,
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    models,
  };
}

function normalizeAiConfig(rawConfig = {}) {
  const provider = rawConfig.provider || "heuristic";
  const endpoint = String(rawConfig.endpoint || "").trim();
  const model = String(rawConfig.model || "").trim();
  const apiKey = String(rawConfig.apiKey || "").trim();

  if (provider === "ollama") {
    return {
      provider,
      endpoint: endpoint || DEFAULT_OLLAMA_ENDPOINT,
      model,
      apiKey: "",
      enabled: Boolean(model),
      label: model ? `Ollama / ${model}` : "Ollama (no model selected)",
    };
  }

  if (provider === "openai-compatible") {
    return {
      provider,
      endpoint: endpoint || DEFAULT_OPENAI_COMPAT_ENDPOINT,
      model,
      apiKey,
      enabled: Boolean(model && (endpoint || DEFAULT_OPENAI_COMPAT_ENDPOINT)),
      label: model ? `OpenAI-compatible / ${model}` : "OpenAI-compatible (no model selected)",
    };
  }

  return {
    provider: "heuristic",
    endpoint: "",
    model: "",
    apiKey: "",
    enabled: false,
    label: "Local heuristics",
  };
}

async function requestStructuredJson({ aiConfig, systemPrompt, userPrompt, timeoutMs = DEFAULT_CHAT_TIMEOUT_MS }) {
  const normalized = normalizeAiConfig(aiConfig);

  if (!normalized.enabled) {
    throw new Error("No AI model is configured for this step.");
  }

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

  if (!normalized.enabled) {
    throw new Error("No AI model is configured for this step.");
  }

  const rawText = await requestProviderChat({
    normalized,
    systemPrompt,
    messages,
    expectJson: false,
    timeoutMs,
  });

  const reply = String(rawText || "").trim();

  if (!reply) {
    throw new Error("The model did not return useful content.");
  }

  return reply;
}

async function requestProviderChat({ normalized, systemPrompt, messages, expectJson, timeoutMs = DEFAULT_CHAT_TIMEOUT_MS }) {
  const normalizedMessages = sanitizeChatMessages(messages);

  if (!normalizedMessages.length) {
    throw new Error("No messages were sent to the model.");
  }

  if (normalized.provider === "ollama") {
    return requestOllamaChat({
      normalized,
      systemPrompt,
      messages: normalizedMessages,
      expectJson,
      timeoutMs,
    });
  }

  return requestOpenAiCompatibleChat({
    normalized,
    systemPrompt,
    messages: normalizedMessages,
    expectJson,
    timeoutMs,
  });
}

function sanitizeChatMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => ({
      role: normalizeRole(message?.role),
      content: String(message?.content || "").trim(),
    }))
    .filter((message) => message.content);
}

function normalizeRole(role) {
  if (role === "assistant" || role === "system") {
    return role;
  }

  return "user";
}

async function requestOllamaChat({ normalized, systemPrompt, messages, expectJson, timeoutMs }) {
  let response;

  try {
    response = await fetchWithTimeout(`${normalized.endpoint}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: normalized.model,
        stream: false,
        format: expectJson ? "json" : undefined,
        options: {
          temperature: expectJson ? 0.2 : 0.35,
        },
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    }, timeoutMs);
  } catch (error) {
    throw wrapTimeoutError(error, normalized.label, timeoutMs);
  }

  if (!response.ok) {
    const details = await safeReadText(response);
    throw new Error(`Failed to query Ollama (${response.status}). ${details}`.trim());
  }

  const payload = await response.json();
  return payload.message?.content || "";
}

async function requestOpenAiCompatibleChat({ normalized, systemPrompt, messages, timeoutMs }) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (normalized.apiKey) {
    headers.Authorization = `Bearer ${normalized.apiKey}`;
  }

  let response;

  try {
    response = await fetchWithTimeout(`${trimTrailingSlash(normalized.endpoint)}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: normalized.model,
        temperature: 0.35,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    }, timeoutMs);
  } catch (error) {
    throw wrapTimeoutError(error, normalized.label, timeoutMs);
  }

  if (!response.ok) {
    const details = await safeReadText(response);
    throw new Error(`Failed to query the OpenAI-compatible endpoint (${response.status}). ${details}`.trim());
  }

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content || "";
}

function parseJsonResponse(text) {
  const normalized = String(text || "").trim();

  if (!normalized) {
    throw new Error("The model did not return useful content.");
  }

  try {
    return JSON.parse(normalized);
  } catch (error) {
    const fencedMatch = normalized.match(/```json\s*([\s\S]*?)```/i) || normalized.match(/```\s*([\s\S]*?)```/i);
    if (fencedMatch) {
      return JSON.parse(fencedMatch[1].trim());
    }

    const objectMatch = normalized.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    throw new Error("The model response was not valid JSON.");
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

async function safeReadText(response) {
  try {
    return (await response.text()).trim();
  } catch (error) {
    return "";
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function wrapTimeoutError(error, providerLabel, timeoutMs) {
  if (error?.name === "AbortError") {
    const seconds = Math.max(1, Math.round(timeoutMs / 1000));
    return new Error(`${providerLabel} timed out after ${seconds}s.`);
  }

  return error;
}

module.exports = {
  DEFAULT_OLLAMA_ENDPOINT,
  DEFAULT_OPENAI_COMPAT_ENDPOINT,
  DEFAULT_CHAT_TIMEOUT_MS,
  getAiProviderStatus,
  normalizeAiConfig,
  requestStructuredJson,
  requestTextResponse,
};
