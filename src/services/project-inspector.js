const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");
const { spawnSync } = require("child_process");

const MAX_DEPTH = 4;
const MAX_FILES = 600;
const MAX_PREVIEW_CHARS = 5000;
const MAX_UI_FILES = 10;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "action-e2e-prototype",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  "prototype-runs",
  ".idea",
  ".vscode",
  "__pycache__",
  "venv",
  ".venv",
  "target",
]);

async function inspectProject(projectPath, { onProgress = () => {} } = {}) {
  const resolvedProjectPath = path.resolve(projectPath);
  onProgress({ phase: "directory-scan", message: "Scanning the project structure and relevant files...", progress: 10 });
  const stat = await fs.stat(resolvedProjectPath).catch(() => null);

  if (!stat || !stat.isDirectory()) {
    throw new Error("The provided path does not point to a valid directory.");
  }

  const files = [];
  await walkProject(resolvedProjectPath, resolvedProjectPath, 0, files);
  onProgress({ phase: "manifest-analysis", message: `Indexed ${files.length} file(s); reading manifests and dependencies...`, progress: 26 });

  const extensionCounts = countExtensions(files);
  const packageJsonEntries = files.filter((file) => path.basename(file.relativePath) === "package.json");
  const packageJsonEntry = packageJsonEntries.find((file) => file.relativePath === "package.json") || packageJsonEntries[0];
  const readmeEntry = files.find((file) => /^readme(\.[a-z0-9]+)?$/i.test(path.basename(file.relativePath)));
  const htmlCandidates = files.filter((file) => /\.(html?|jsx?|tsx?)$/i.test(file.relativePath));
  const manifestCandidates = await Promise.all(packageJsonEntries.map(async (entry) => ({
    entry,
    manifest: await readJsonSafe(entry.absolutePath).catch(() => null),
  })));
  const rootManifest = manifestCandidates.find((candidate) => candidate.entry.relativePath === "package.json") || null;
  const primaryManifestCandidate = choosePrimaryManifest(manifestCandidates) || rootManifest;
  const packageManifest = primaryManifestCandidate?.manifest || null;
  onProgress({ phase: "documentation", message: "Reading project documentation and representative source files...", progress: 38 });
  const readmeExcerpt = readmeEntry ? await readTextExcerpt(readmeEntry.absolutePath) : "";
  const relevantFiles = await readRelevantFiles(files, resolvedProjectPath);
  onProgress({ phase: "interface-signals", message: "Extracting routes, controls, forms, and interface signals...", progress: 50 });
  const uiHints = await extractUiHints(htmlCandidates, resolvedProjectPath);
  onProgress({ phase: "technology-detection", message: "Inferring the application type, framework, language, and start command...", progress: 61 });
  const framework = detectFramework(packageManifest, files);
  const primaryLanguage = detectPrimaryLanguage(extensionCounts, packageManifest);
  const appType = detectAppType({
    readmeExcerpt,
    packageManifest,
    relevantFiles,
    uiHints,
  });
  const runtime = recommendRuntime({
    files,
    manifestCandidate: primaryManifestCandidate || rootManifest,
    framework,
    readmeExcerpt,
  });

  const signals = buildSignals({
    framework,
    primaryLanguage,
    appType,
    relevantFiles,
    uiHints,
    packageManifest,
  });

  const confidence = buildInspectionConfidence({
    readmeExcerpt,
    packageManifest,
    uiHints,
    files,
  });

  onProgress({ phase: "inspection-summary", message: "Building the initial project understanding and confidence report...", progress: 68 });

  return {
    project: {
      name: path.basename(resolvedProjectPath),
      path: resolvedProjectPath,
    },
    projectSynopsis: buildProjectSynopsis({
      framework,
      primaryLanguage,
      appType,
      packageManifest,
      readmeExcerpt,
      uiHints,
    }),
    stats: {
      totalFiles: files.length,
      languages: extensionCounts,
      htmlLikeFiles: htmlCandidates.length,
    },
    detection: {
      primaryLanguage,
      framework,
      appType,
      confidence,
    },
    runtime,
    manifests: {
      packageJson: packageManifest
        ? {
            name: packageManifest.name || null,
            path: primaryManifestCandidate?.entry.relativePath || packageJsonEntry?.relativePath || null,
            scripts: packageManifest.scripts || {},
            dependencies: listTopDependencies(packageManifest),
          }
        : null,
      readme: readmeEntry
        ? {
            path: readmeEntry.relativePath,
            excerpt: readmeExcerpt,
          }
        : null,
    },
    relevantFiles,
    uiHints,
    signals,
    warnings: buildWarnings({ appType, runtime, readmeExcerpt, uiHints }),
  };
}

async function walkProject(root, currentDir, depth, collector) {
  if (collector.length >= MAX_FILES || depth > MAX_DEPTH) {
    return;
  }

  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (collector.length >= MAX_FILES) {
      break;
    }

    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await walkProject(root, absolutePath, depth + 1, collector);
      }
      continue;
    }

    collector.push({
      absolutePath,
      relativePath,
      extension: path.extname(entry.name).toLowerCase(),
      name: entry.name,
    });
  }
}

function countExtensions(files) {
  const counts = {};

  for (const file of files) {
    const extension = file.extension || "[sem_extensao]";
    counts[extension] = (counts[extension] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]).slice(0, 8)
  );
}

function detectPrimaryLanguage(extensionCounts, packageManifest) {
  if (packageManifest?.dependencies?.typescript || packageManifest?.devDependencies?.typescript) {
    return "TypeScript";
  }

  const ranked = Object.entries(extensionCounts);
  const topExtension = ranked.length ? ranked[0][0] : "";
  const extensionMap = {
    ".js": "JavaScript",
    ".jsx": "JavaScript (JSX)",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (TSX)",
    ".py": "Python",
    ".java": "Java",
    ".rb": "Ruby",
    ".php": "PHP",
    ".go": "Go",
    ".html": "HTML",
    ".css": "CSS",
  };

  return extensionMap[topExtension] || "Undetermined";
}

function detectFramework(packageManifest, files) {
  const dependencies = {
    ...(packageManifest?.dependencies || {}),
    ...(packageManifest?.devDependencies || {}),
  };
  const scriptText = Object.values(packageManifest?.scripts || {}).join(" ");

  if (dependencies.vinext || /\bvinext\b/i.test(scriptText)) return "Vinext";
  if (dependencies.next) return "Next.js";
  if (dependencies.react) return "React";
  if (dependencies.vue) return "Vue";
  if (dependencies["@angular/core"]) return "Angular";
  if (dependencies.svelte) return "Svelte";
  if (dependencies.express) return "Express";
  if (dependencies.vite) return "Vite";
  if (files.some((file) => file.relativePath === "index.html")) return "Static web application";

  return "Framework not identified";
}

function detectAppType({ readmeExcerpt, packageManifest, relevantFiles, uiHints }) {
  const readmeText = String(readmeExcerpt || "").toLowerCase();
  const combinedText = [
    readmeExcerpt,
    relevantFiles.map((file) => `${file.relativePath} ${file.excerpt || ""}`).join("\n"),
    uiHints.headings.map((item) => item.text).join(" "),
    uiHints.buttons.map((item) => item.text).join(" "),
  ]
    .join("\n")
    .toLowerCase();

  const graphicsSignals = (combinedText.match(/\b(rasteriza|desenho|drawing|draw|polygon|pol[iÃ­]gono|circunfer[Ãªe]ncia|geometry|geometric|coordinate)\b/g) || []).length;

  if (uiHints.canvases.length > 0 || graphicsSignals >= 2) {
    return "graphics-canvas";
  }

  const commercePattern = /\b(cart|checkout|carrinho|vitrine|produto|product|compra|shopping|pedido)\b/;
  if (commercePattern.test(readmeText) || commercePattern.test(combinedText)) {
    return "commerce";
  }

  if (/\b(login|sign in|senha|password|autentica|auth|entrar)\b/.test(combinedText)) {
    return "authentication";
  }

  if (/\b(dashboard|painel|analytics|chart|relat[oÃ³]rio)\b/.test(combinedText)) {
    return "dashboard";
  }

  if (uiHints.forms.length > 0 || uiHints.inputs.length >= 3) {
    return "form-centric";
  }

  if (uiHints.links.length >= 3) {
    return "content-navigation";
  }

  if (packageManifest?.private && packageManifest?.scripts?.dev) {
    return "single-page-application";
  }

  return "generic-web";
}

function recommendRuntime({ files, manifestCandidate, framework, readmeExcerpt }) {
  const packageManifest = manifestCandidate?.manifest || null;
  const hasIndexHtml = files.some((file) => file.relativePath === "index.html");
  const hasPackageJson = Boolean(packageManifest);
  const scripts = packageManifest?.scripts || {};
  const packageManager = detectPackageManager(files, packageManifest);
  const installCommand = buildInstallCommand(packageManager);
  const readmeRuntime = inferRuntimeFromReadme(readmeExcerpt);
  const workingDirectory = manifestWorkingDirectory(manifestCandidate);

  if (hasIndexHtml && !hasPackageJson) {
    return {
      mode: "static",
      supportedForExecution: true,
      installCommand: "",
      startCommand: "",
      baseUrl: "auto",
      workingDirectory: ".",
      source: "static-file-detection",
      notes: "The application appears to be static. The prototype can serve it internally without changing the original project.",
    };
  }

  if (hasPackageJson && (scripts.dev || scripts.start || scripts.preview)) {
    const selectedScriptName = scripts.dev ? "dev" : scripts.start ? "start" : "preview";
    const selectedScript = scripts[selectedScriptName];
    const startCommand = `${packageManager} run ${selectedScriptName}`;
    return {
      mode: "command",
      supportedForExecution: true,
      installCommand,
      startCommand,
      baseUrl: guessBaseUrl(framework, selectedScript),
      workingDirectory,
      source: "package-manifest",
      notes: `Command and base URL were inferred from ${manifestCandidate?.entry?.relativePath || "package.json"}. The interface allows manual review before execution.`,
    };
  }

  if (readmeRuntime) {
    return {
      mode: "command",
      supportedForExecution: true,
      installCommand: readmeRuntime.installCommand || installCommand,
      startCommand: readmeRuntime.startCommand,
      baseUrl: readmeRuntime.baseUrl || "http://127.0.0.1:3000",
      workingDirectory: ".",
      source: "readme",
      notes: "The runtime suggestion was inferred from README instructions and should be reviewed before live exploration or execution.",
    };
  }

  return {
    mode: "manual",
    supportedForExecution: false,
    installCommand,
    startCommand: "",
    baseUrl: "",
    workingDirectory: ".",
    source: "unresolved",
    notes: "The project could be analyzed, but no reliable local startup flow was identified.",
  };
}

function detectPackageManager(files, packageManifest = {}, commandAvailable = isCommandAvailable) {
  const declaredManager = String(packageManifest?.packageManager || "").toLowerCase();
  if (declaredManager.startsWith("bun@")) return "bun";
  if (declaredManager.startsWith("pnpm@")) return "pnpm";
  if (declaredManager.startsWith("yarn@")) return "yarn";
  if (files.some((file) => /(^|\/)bun\.lockb?$/i.test(file.relativePath))) return "bun";
  if (files.some((file) => file.relativePath === "pnpm-lock.yaml") && commandAvailable("pnpm")) return "pnpm";
  if (files.some((file) => file.relativePath === "yarn.lock") && commandAvailable("yarn")) return "yarn";
  return "npm";
}

function isCommandAvailable(command) {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  return spawnSync(lookup, [command], { stdio: "ignore", windowsHide: true }).status === 0;
}

function buildInstallCommand(packageManager) {
  if (packageManager === "bun") return "bun install";
  if (packageManager === "pnpm") return "pnpm install";
  if (packageManager === "yarn") return "yarn install";
  return "npm install";
}

function manifestWorkingDirectory(manifestCandidate) {
  const relativePath = String(manifestCandidate?.entry?.relativePath || "package.json").replace(/\\/g, "/");
  const directory = path.posix.dirname(relativePath);
  return directory === "." ? "." : directory;
}

function guessBaseUrl(framework, selectedScript) {
  const scriptText = String(selectedScript || "").toLowerCase();
  const prefersLocalhost = framework === "Vinext" || framework === "Vite" || /\b(?:vinext|vite)\b/.test(scriptText);
  const loopbackHost = prefersLocalhost ? "localhost" : "127.0.0.1";
  const explicitUrl = scriptText.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}/i);
  const explicitPort = scriptText.match(/(?:--port|\-p|port=)\s*(?:=\s*)?(\d{2,5})/i);

  if (explicitUrl) return explicitUrl[0];
  if (explicitPort) return `http://${loopbackHost}:${explicitPort[1]}`;

  if (/5173/.test(scriptText) || framework === "Vite") return "http://localhost:5173";
  if (framework === "Vinext") return "http://localhost:3000";
  if (/4200/.test(scriptText) || framework === "Angular") return "http://127.0.0.1:4200";
  if (/4173/.test(scriptText)) return "http://127.0.0.1:4173";
  if (/webpack(?:-dev-server|\s+serve)/.test(scriptText)) return "http://127.0.0.1:8080";
  if (/8080/.test(scriptText)) return "http://127.0.0.1:8080";
  return "http://127.0.0.1:3000";
}

function choosePrimaryManifest(candidates) {
  const ranked = (candidates || [])
    .filter((candidate) => candidate?.manifest)
    .map((candidate) => ({
      ...candidate,
      score: scoreManifestCandidate(candidate),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0] || null;
}

function scoreManifestCandidate(candidate) {
  const manifest = candidate.manifest || {};
  const dependencies = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  };
  const scripts = manifest.scripts || {};
  const location = candidate.entry?.relativePath || "";
  let score = location === "package.json" ? 4 : 0;

  if (dependencies.next) score += 40;
  if (dependencies.react || dependencies["@angular/core"] || dependencies.vue || dependencies.svelte) score += 28;
  if (dependencies.vite) score += 20;
  if (scripts.dev || scripts.start) score += 10;
  if (/^(apps|packages)\/web\//i.test(location)) score += 14;
  if (/mobile|native/i.test(location)) score -= 12;

  return score;
}

function inferRuntimeFromReadme(readmeExcerpt) {
  const text = String(readmeExcerpt || "");
  if (!text) {
    return null;
  }

  const installMatch = text.match(/\b(npm install|npm ci|pnpm install|yarn install|yarn)\b/i);
  const startMatch = text.match(/\b(npm run dev|npm start|npm run start|npm run preview|pnpm dev|pnpm start|pnpm preview|yarn dev|yarn start|yarn preview|vite|next dev)\b/i);
  const urlMatch = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}(?:\/[^\s]*)?/i);

  if (!startMatch) {
    return null;
  }

  return {
    installCommand: installMatch ? installMatch[1] : "",
    startCommand: startMatch[1],
    baseUrl: urlMatch ? urlMatch[0] : "",
  };
}

async function readRelevantFiles(files, projectPath) {
  const scored = files
    .map((file) => ({
      ...file,
      score: scoreFile(file),
    }))
    .filter((file) => file.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);

  return Promise.all(
    scored.map(async (file) => ({
      relativePath: file.relativePath,
      category: categorizeFile(file.relativePath),
      excerpt: await readTextExcerpt(path.join(projectPath, file.relativePath)),
    }))
  );
}

function scoreFile(file) {
  const relativePath = file.relativePath.toLowerCase();
  let score = 0;

  if (/^readme/.test(path.basename(relativePath))) score += 10;
  if (relativePath === "package.json") score += 10;
  if (/index\.html$/.test(relativePath)) score += 9;
  if (/(app|main|index|router|routes|page|layout)\.(js|jsx|ts|tsx)$/.test(relativePath)) score += 8;
  if (/(component|screen|view|panel)/.test(relativePath)) score += 5;
  if (/\.(js|jsx|ts|tsx|html|md)$/.test(relativePath)) score += 3;

  return score;
}

function categorizeFile(relativePath) {
  if (/^readme/i.test(path.basename(relativePath))) return "documentation";
  if (relativePath === "package.json") return "manifest";
  if (/index\.html$/i.test(relativePath)) return "entrypoint";
  if (/\.(jsx?|tsx?)$/i.test(relativePath)) return "source";
  return "support";
}

async function readTextExcerpt(filePath) {
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_PREVIEW_CHARS);
}

async function readJsonSafe(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function extractUiHints(files, projectPath) {
  const candidates = files.slice(0, MAX_UI_FILES);
  const headings = [];
  const buttons = [];
  const links = [];
  const inputs = [];
  const forms = [];
  const canvases = [];
  const statusElements = [];

  for (const file of candidates) {
    const absolutePath = path.join(projectPath, file.relativePath);
    const source = await fs.readFile(absolutePath, "utf8").catch(() => "");

    if (!source) {
      continue;
    }

    if (/\.(html?)$/i.test(file.relativePath)) {
      const $ = cheerio.load(source);

      $("h1, h2, h3").each((_, node) => {
        pushUnique(headings, nodeToHeading($(node), file.relativePath), (item) => item.text);
      });

      $("button").each((_, node) => {
        pushUnique(buttons, nodeToButton($(node), file.relativePath), (item) => item.key);
      });

      $("a[href]").each((_, node) => {
        pushUnique(links, nodeToLink($(node), file.relativePath), (item) => item.key);
      });

      $("input, textarea, select").each((_, node) => {
        pushUnique(inputs, nodeToInput($(node), file.relativePath), (item) => item.key);
      });

      $("form").each((_, node) => {
        pushUnique(forms, nodeToForm($(node), file.relativePath), (item) => item.key);
      });

      $("canvas").each((_, node) => {
        pushUnique(canvases, nodeToCanvas($(node), file.relativePath), (item) => item.key);
      });

      $("[id], [class]").each((_, node) => {
        const candidate = nodeToStatusElement($(node), file.relativePath);
        if (candidate) {
          pushUnique(statusElements, candidate, (item) => item.key);
        }
      });
    } else {
      extractFromJsLikeSource({
        source,
        filePath: file.relativePath,
        headings,
        buttons,
        links,
        inputs,
        forms,
        canvases,
        statusElements,
      });
    }
  }

  return {
    headings: headings.slice(0, 8),
    buttons: buttons.slice(0, 12),
    links: links.slice(0, 10),
    inputs: inputs.slice(0, 10),
    forms: forms.slice(0, 5),
    canvases: canvases.slice(0, 4),
    statusElements: statusElements.slice(0, 8),
  };
}

function extractFromJsLikeSource({
  source,
  filePath,
  headings,
  buttons,
  links,
  inputs,
  forms,
  canvases,
  statusElements,
}) {
  const buttonRegex = /<button([^>]*)>([^<]{1,80})<\/button>/gi;
  const headingRegex = /<h([1-3])([^>]*)>([^<]{1,120})<\/h\1>/gi;
  const inputRegex = /<(input|textarea|select)([^>]*)>/gi;
  const canvasRegex = /<canvas([^>]*)>/gi;
  const formRegex = /<form([^>]*)>/gi;
  const linkRegex = /<a([^>]*)href=["']([^"']+)["'][^>]*>([^<]{1,100})<\/a>/gi;
  const statusRegex = /(toolLabel|statusMessage|resultSummary|selectionSummary|feedback|message|summary)/gi;

  for (const match of source.matchAll(buttonRegex)) {
    const attributes = match[1];
    const text = normalizeText(match[2]);
    const id = extractAttribute(attributes, "id");
    const dataTool = extractAttribute(attributes, "data-tool");

    pushUnique(
      buttons,
      {
        key: `${filePath}:${id || dataTool || text}`,
        text,
        id,
        dataTool,
        filePath,
        target: id
          ? { strategy: "id", value: id }
          : dataTool
            ? { strategy: "dataTool", value: dataTool }
            : { strategy: "roleText", role: "button", value: text },
      },
      (item) => item.key
    );
  }

  for (const match of source.matchAll(headingRegex)) {
    const text = normalizeText(match[3]);
    pushUnique(
      headings,
      {
        text,
        level: `h${match[1]}`,
        filePath,
        target: { strategy: "roleText", role: "heading", value: text },
      },
      (item) => `${item.filePath}:${item.text}`
    );
  }

  for (const match of source.matchAll(inputRegex)) {
    const attributes = match[2];
    const id = extractAttribute(attributes, "id");
    const name = extractAttribute(attributes, "name");
    const type = extractAttribute(attributes, "type") || match[1];
    const placeholder = extractAttribute(attributes, "placeholder");
    pushUnique(
      inputs,
      {
        key: `${filePath}:${id || name || placeholder || type}`,
        id,
        name,
        type,
        placeholder,
        filePath,
        target: id ? { strategy: "id", value: id } : placeholder ? { strategy: "placeholder", value: placeholder } : null,
      },
      (item) => item.key
    );
  }

  for (const match of source.matchAll(linkRegex)) {
    const href = normalizeText(match[2]);
    const text = normalizeText(match[3]);
    pushUnique(
      links,
      {
        key: `${filePath}:${href}:${text}`,
        href,
        text,
        filePath,
        target: { strategy: "href", value: href },
      },
      (item) => item.key
    );
  }

  for (const match of source.matchAll(formRegex)) {
    const attributes = match[1];
    const id = extractAttribute(attributes, "id");
    pushUnique(
      forms,
      {
        key: `${filePath}:${id || "form"}`,
        id,
        filePath,
        target: id ? { strategy: "id", value: id } : { strategy: "selector", value: "form" },
      },
      (item) => item.key
    );
  }

  for (const match of source.matchAll(canvasRegex)) {
    const attributes = match[1];
    const id = extractAttribute(attributes, "id");
    pushUnique(
      canvases,
      {
        key: `${filePath}:${id || "canvas"}`,
        id,
        filePath,
        target: id ? { strategy: "id", value: id } : { strategy: "selector", value: "canvas" },
      },
      (item) => item.key
    );
  }

  for (const match of source.matchAll(statusRegex)) {
    const value = match[1];
    pushUnique(
      statusElements,
      {
        key: `${filePath}:${value}`,
        label: value,
        filePath,
        target: { strategy: "id", value },
      },
      (item) => item.key
    );
  }
}

function nodeToHeading(node, filePath) {
  const text = normalizeText(node.text());
  return {
    text,
    level: node[0].tagName,
    filePath,
    target: { strategy: "roleText", role: "heading", value: text },
  };
}

function nodeToButton(node, filePath) {
  const text = normalizeText(node.text());
  const id = node.attr("id") || null;
  const dataTool = node.attr("data-tool") || null;
  return {
    key: `${filePath}:${id || dataTool || text}`,
    text,
    id,
    dataTool,
    filePath,
    target: id
      ? { strategy: "id", value: id }
      : dataTool
        ? { strategy: "dataTool", value: dataTool }
        : { strategy: "roleText", role: "button", value: text },
  };
}

function nodeToLink(node, filePath) {
  const href = normalizeText(node.attr("href") || "");
  const text = normalizeText(node.text()) || href;
  return {
    key: `${filePath}:${href}:${text}`,
    href,
    text,
    filePath,
    target: { strategy: "href", value: href },
  };
}

function nodeToInput(node, filePath) {
  const id = node.attr("id") || null;
  const name = node.attr("name") || null;
  const placeholder = node.attr("placeholder") || null;
  const type = node.attr("type") || node[0].tagName;
  return {
    key: `${filePath}:${id || name || placeholder || type}`,
    id,
    name,
    placeholder,
    type,
    filePath,
    required: node.is("[required]"),
    target: id ? { strategy: "id", value: id } : placeholder ? { strategy: "placeholder", value: placeholder } : null,
  };
}

function nodeToForm(node, filePath) {
  const id = node.attr("id") || null;
  return {
    key: `${filePath}:${id || "form"}`,
    id,
    filePath,
    target: id ? { strategy: "id", value: id } : { strategy: "selector", value: "form" },
  };
}

function nodeToCanvas(node, filePath) {
  const id = node.attr("id") || null;
  return {
    key: `${filePath}:${id || "canvas"}`,
    id,
    filePath,
    target: id ? { strategy: "id", value: id } : { strategy: "selector", value: "canvas" },
  };
}

function nodeToStatusElement(node, filePath) {
  const id = node.attr("id") || "";
  const className = node.attr("class") || "";
  const candidate = `${id} ${className}`;

  if (!/(status|label|summary|result|message|feedback|count|total)/i.test(candidate)) {
    return null;
  }

  if (id) {
    return {
      key: `${filePath}:${id}`,
      label: id,
      filePath,
      target: { strategy: "id", value: id },
    };
  }

  return {
    key: `${filePath}:${className}`,
    label: className,
    filePath,
    target: { strategy: "selector", value: `.${className.split(/\s+/).filter(Boolean).join(".")}` },
  };
}

function extractAttribute(attributes, name) {
  const match = new RegExp(`${name}=["']([^"']+)["']`, "i").exec(attributes);
  return match ? normalizeText(match[1]) : null;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pushUnique(list, candidate, makeKey) {
  if (!candidate) {
    return;
  }

  const key = makeKey(candidate);

  if (!key) {
    return;
  }

  if (!list.some((item) => makeKey(item) === key)) {
    list.push(candidate);
  }
}

function listTopDependencies(packageManifest) {
  const allDependencies = {
    ...(packageManifest.dependencies || {}),
    ...(packageManifest.devDependencies || {}),
  };

  return Object.keys(allDependencies).slice(0, 12);
}

function buildSignals({ framework, primaryLanguage, appType, relevantFiles, uiHints, packageManifest }) {
  const signals = [
    `Primary language detected: ${primaryLanguage}.`,
    `Framework inferred: ${framework}.`,
    `Functional archetype inferred: ${appType}.`,
  ];

  if (packageManifest?.name) {
    signals.push(`A package.json manifest was found for project ${packageManifest.name}.`);
  }

  if (uiHints.canvases.length) {
    signals.push(`${uiHints.canvases.length} canvas elements were detected, suggesting strong graphical interaction.`);
  }

  if (uiHints.forms.length || uiHints.inputs.length) {
    signals.push(`The interface exposes ${uiHints.inputs.length} input fields and ${uiHints.forms.length} candidate forms.`);
  }

  if (uiHints.buttons.length) {
    signals.push(`There are ${uiHints.buttons.length} explicit buttons or actions available for flow composition.`);
  }

  if (relevantFiles.length) {
    signals.push(`Key files used during project reading: ${relevantFiles.slice(0, 4).map((item) => item.relativePath).join(", ")}.`);
  }

  return signals;
}

function buildInspectionConfidence({ readmeExcerpt, packageManifest, uiHints, files }) {
  let score = 35;
  if (readmeExcerpt) score += 20;
  if (packageManifest) score += 20;
  if (uiHints.headings.length || uiHints.buttons.length) score += 15;
  if (files.some((file) => file.relativePath === "index.html")) score += 10;

  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function buildProjectSynopsis({ framework, primaryLanguage, appType, packageManifest, readmeExcerpt, uiHints }) {
  const readmeSignal = readmeExcerpt ? `The initial documentation describes ${readmeExcerpt.slice(0, 180)}...` : "The available documentation is limited.";
  const uiSignal = uiHints.buttons.length
    ? `The interface reading found ${uiHints.buttons.length} actions and ${uiHints.headings.length} relevant headings.`
    : "The interface still offers few structured signals for automatic interpretation.";
  const packageSignal = packageManifest?.name ? `The manifest indicates package ${packageManifest.name}.` : "No package manifest in package.json format was identified.";

  return `${framework} in ${primaryLanguage}, provisionally classified as ${appType}. ${packageSignal} ${uiSignal} ${readmeSignal}`;
}

function buildWarnings({ appType, runtime, readmeExcerpt, uiHints }) {
  const warnings = [];

  if (!readmeExcerpt) {
    warnings.push("No README with enough information to contextualize the system was found.");
  }

  if (runtime.mode === "manual") {
    warnings.push("The project startup flow could not be inferred automatically. The execution step will require manual configuration.");
  }

  if (uiHints.buttons.length === 0 && uiHints.forms.length === 0 && uiHints.canvases.length === 0) {
    warnings.push("The apparent interface exposes few explicit signals. The proposed flows will have reduced confidence.");
  }

  if (appType === "generic-web") {
    warnings.push("The functional archetype is still generic; human review of the criteria is recommended before test generation.");
  }

  return warnings;
}

module.exports = {
  detectAppType,
  detectPackageManager,
  inspectProject,
  recommendRuntime,
};
