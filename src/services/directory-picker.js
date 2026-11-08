const { spawn } = require("child_process");

const PROMPT = "Select the project folder to inspect";

// Native folder dialogs per platform. The picker only returns a path chosen by the local user; the server still
// validates it before inspection. Linux depends on an installed desktop helper (zenity or kdialog).
function pickerCommands(platform = process.platform) {
  if (platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "[System.Windows.Forms.Application]::EnableVisualStyles()",
      "$shell = New-Object -ComObject Shell.Application",
      `$folder = $shell.BrowseForFolder(0, '${PROMPT}', 0, 0)`,
      "if ($folder -and $folder.Self -and $folder.Self.Path) {",
      "  [Console]::Out.Write($folder.Self.Path)",
      "  exit 0",
      "}",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      `$dialog.Description = '${PROMPT}'`,
      "$dialog.ShowNewFolderButton = $false",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
      "  [Console]::Out.Write($dialog.SelectedPath)",
      "}",
    ].join("; ");
    const encodedScript = Buffer.from(script, "utf16le").toString("base64");
    return [{ command: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-EncodedCommand", encodedScript] }];
  }
  if (platform === "darwin") {
    // A cancelled dialog exits with -128 and no stdout; it is treated as "no selection".
    return [{ command: "osascript", args: ["-e", `POSIX path of (choose folder with prompt "${PROMPT}")`], cancelCodes: [1] }];
  }
  if (platform === "linux") {
    return [
      { command: "zenity", args: ["--file-selection", "--directory", `--title=${PROMPT}`], cancelCodes: [1] },
      { command: "kdialog", args: ["--getexistingdirectory", ".", "--title", PROMPT], cancelCodes: [1] },
    ];
  }
  return [];
}

function normalizeSelection(output, platform = process.platform) {
  const value = String(output || "").trim();
  if (!value) return null;
  // osascript returns a trailing slash for folders ("/Users/me/app/"); keep "/" itself intact.
  return platform === "win32" || value === "/" ? value : value.replace(/\/+$/, "");
}

function runPicker({ command, args, cancelCodes = [] }, platform, spawnProcess) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        if (cancelCodes.includes(code) || /-128|cancel/i.test(stderr)) { resolve(null); return; }
        reject(new Error(stderr.trim() || "Failed to open the folder picker."));
        return;
      }
      resolve(normalizeSelection(stdout, platform));
    });
  });
}

async function openProjectDirectoryDialog({ platform = process.platform, spawnProcess = spawn } = {}) {
  const commands = pickerCommands(platform);
  if (!commands.length) {
    throw new Error("No native folder picker is available on this platform. Use the manual path field.");
  }
  let lastError = null;
  for (const candidate of commands) {
    try {
      return await runPicker(candidate, platform, spawnProcess);
    } catch (error) {
      // A missing helper (ENOENT) on Linux falls through to the next desktop helper.
      lastError = error;
      if (error.code !== "ENOENT") throw error;
    }
  }
  throw new Error(platform === "linux"
    ? "Install zenity or kdialog to use the native folder picker, or use the manual path field."
    : (lastError?.message || "Failed to open the folder picker."));
}

module.exports = {
  openProjectDirectoryDialog,
  pickerCommands,
  normalizeSelection,
};
