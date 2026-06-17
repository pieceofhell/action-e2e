const { spawn } = require("child_process");

async function openProjectDirectoryDialog() {
  if (process.platform !== "win32") {
    throw new Error("The native folder picker in this initial version is available only on Windows. Use the manual path field on other platforms.");
  }

  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "$shell = New-Object -ComObject Shell.Application",
    "$folder = $shell.BrowseForFolder(0, 'Select the project folder to inspect', 0, 0)",
    "if ($folder -and $folder.Self -and $folder.Self.Path) {",
    "  [Console]::Out.Write($folder.Self.Path)",
    "  exit 0",
    "}",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = 'Select the project folder to inspect'",
    "$dialog.ShowNewFolderButton = $false",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::Out.Write($dialog.SelectedPath)",
    "}",
  ].join("; ");

  const encodedScript = Buffer.from(script, "utf16le").toString("base64");

  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-EncodedCommand",
      encodedScript,
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || "Failed to open the folder picker."));
        return;
      }

      resolve(stdout.trim() || null);
    });
  });
}

module.exports = {
  openProjectDirectoryDialog,
};
