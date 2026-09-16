$ErrorActionPreference = "Stop"

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtimeRoot = Join-Path $workspaceRoot "runtimes\llama.cpp-b10819-vulkan"
$server = Join-Path $runtimeRoot "llama-server.exe"
$model = Join-Path $workspaceRoot "models\qwen3.8-27b-unsloth\Qwen3.8-27B-UD-IQ1_M.gguf"
$projector = Join-Path $workspaceRoot "models\qwen3.8-27b-unsloth\mmproj-BF16.gguf"

foreach ($requiredPath in @($server, $model, $projector)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Required llama.cpp asset was not found: $requiredPath"
  }
}

& $server `
  --model $model `
  --mmproj $projector `
  --mmproj-device Vulkan0 `
  --alias "qwen3.8-vl-27b-iq1m-64k" `
  --ctx-size 65536 `
  --parallel 1 `
  --n-gpu-layers all `
  --device Vulkan0 `
  --flash-attn on `
  --cache-type-k q8_0 `
  --cache-type-v q8_0 `
  --threads 8 `
  --threads-batch 8 `
  --batch-size 2048 `
  --ubatch-size 512 `
  --reasoning auto `
  --no-reasoning-preserve `
  --cache-ram 0 `
  --image-min-tokens 1024 `
  --fit off `
  --host 127.0.0.1 `
  --port 8081 `
  --no-webui

exit $LASTEXITCODE
