const DEFAULT_MAX_OPERATIONS = 80;
const DEFAULT_MAX_EVENTS = 16;
const DEFAULT_TTL_MS = 30 * 60 * 1000;

function createOperationTracker({
  maxOperations = DEFAULT_MAX_OPERATIONS,
  maxEvents = DEFAULT_MAX_EVENTS,
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const operations = new Map();

  function begin({ id, kind, label }) {
    const operationId = normalizeOperationId(id);
    prune();

    const now = new Date().toISOString();
    const operation = {
      id: operationId,
      kind: cleanText(kind, "pipeline"),
      label: cleanText(label, "Pipeline operation"),
      phase: "queued",
      message: "Preparing the operation...",
      progress: 1,
      status: "running",
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      events: [],
      detail: null,
    };

    operations.set(operationId, operation);
    appendEvent(operation, {
      phase: operation.phase,
      message: operation.message,
      progress: operation.progress,
    });
    prune();
    return createReporter(operationId);
  }

  function update(id, { phase, message, progress, detail } = {}) {
    const operation = operations.get(normalizeOperationId(id));
    if (!operation || operation.status !== "running") return null;

    operation.phase = cleanText(phase, operation.phase);
    operation.message = cleanText(message, operation.message);
    operation.progress = normalizeProgress(progress, operation.progress, 99);
    const eventDetail = detail !== undefined ? normalizeOperationDetail(detail) : null;
    if (detail !== undefined) operation.detail = eventDetail;
    operation.updatedAt = new Date().toISOString();
    appendEvent(operation, {
      phase: operation.phase,
      message: operation.message,
      progress: operation.progress,
      detail: eventDetail,
    });
    return toPublicOperation(operation);
  }

  function complete(id, message = "Operation completed.") {
    return finish(id, "completed", message, 100);
  }

  function fail(id, message = "The operation could not be completed.") {
    return finish(id, "failed", message, null);
  }

  function finish(id, status, message, progress) {
    const operation = operations.get(normalizeOperationId(id));
    if (!operation) return null;

    operation.status = status;
    operation.phase = status;
    operation.message = cleanText(message, status === "completed" ? "Operation completed." : "The operation failed.");
    operation.progress = progress === null ? operation.progress : progress;
    operation.updatedAt = new Date().toISOString();
    operation.finishedAt = operation.updatedAt;
    appendEvent(operation, {
      phase: operation.phase,
      message: operation.message,
      progress: operation.progress,
    });
    return toPublicOperation(operation);
  }

  function get(id) {
    const operation = operations.get(normalizeOperationId(id));
    if (!operation) return null;
    return toPublicOperation(operation);
  }

  function createReporter(id) {
    const operationId = normalizeOperationId(id);
    return {
      id: operationId,
      update: (event) => update(operationId, event),
      complete: (message) => complete(operationId, message),
      fail: (message) => fail(operationId, message),
    };
  }

  function appendEvent(operation, event) {
    const previous = operation.events[operation.events.length - 1];
    if (previous?.message === event.message && previous?.phase === event.phase) return;

    operation.events.push({
      phase: event.phase,
      message: event.message,
      progress: event.progress,
      at: operation.updatedAt,
      detail: event.detail ? stripPreviewImage(event.detail) : null,
    });
    operation.events = operation.events.slice(-maxEvents);
  }

  function prune() {
    const expiry = Date.now() - ttlMs;
    for (const [id, operation] of operations) {
      if (Date.parse(operation.updatedAt) < expiry) operations.delete(id);
    }

    while (operations.size >= maxOperations) {
      const oldestId = operations.keys().next().value;
      operations.delete(oldestId);
    }
  }

  return { begin, complete, fail, get, update };
}

function normalizeOperationDetail(value) {
  if (!value || value.type !== "exploration") return null;
  const screenshotDataUrl = typeof value.screenshotDataUrl === "string"
    && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value.screenshotDataUrl)
    && value.screenshotDataUrl.length <= 850000
    ? value.screenshotDataUrl
    : "";
  const action = value.action && typeof value.action === "object" ? {
    id: cleanText(value.action.id, ""),
    kind: cleanText(value.action.kind, ""),
    name: cleanText(value.action.name, ""),
    value: cleanText(value.action.value, ""),
    rationale: cleanText(value.action.rationale, ""),
    expectedOutcome: cleanText(value.action.expectedOutcome, ""),
    protocolCorrection: cleanText(value.action.protocolCorrection, ""),
    changed: typeof value.action.changed === "boolean" ? value.action.changed : null,
  } : null;

  return {
    type: "exploration",
    status: cleanText(value.status, "observing"),
    step: Math.max(0, Math.min(100, Number(value.step) || 0)),
    maxSteps: Math.max(1, Math.min(100, Number(value.maxSteps) || 1)),
    visualPreviewAllowed: Boolean(value.visualPreviewAllowed),
    screenshotDataUrl,
    action,
    state: {
      path: cleanText(value.state?.path, "/"),
      title: cleanText(value.state?.title, ""),
      headings: normalizeTextList(value.state?.headings),
      buttons: normalizeTextList(value.state?.buttons),
      inputs: normalizeTextList(value.state?.inputs),
      visibleTextExcerpt: cleanText(value.state?.visibleTextExcerpt, ""),
    },
  };
}

function normalizeTextList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => cleanText(typeof item === "string" ? item : item?.text || item?.name, ""))
    .filter(Boolean)
    .slice(0, 12);
}

function stripPreviewImage(detail) {
  return { ...detail, screenshotDataUrl: "" };
}

function normalizeOperationId(value) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9-]{8,80}$/i.test(id)) {
    throw new Error("Invalid operation identifier.");
  }
  return id;
}

function normalizeProgress(value, current, ceiling) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return current;
  return Math.max(current, Math.min(ceiling, Math.round(numeric)));
}

function cleanText(value, fallback) {
  const normalized = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return normalized || fallback;
}

function toPublicOperation(operation) {
  return JSON.parse(JSON.stringify(operation));
}

const operationTracker = createOperationTracker();

module.exports = {
  createOperationTracker,
  operationTracker,
};
