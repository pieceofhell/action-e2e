[CmdletBinding()]
param(
  [string]$Server = $env:E2P_LLAMA_SERVER,
  [ValidateSet(0,8,12)][int]$GpuMemoryGB = 0,
  [string]$ModelPath = $env:E2P_MODEL_PATH,
  [string]$ProjectorPath = $env:E2P_PROJECTOR_PATH,
  [ValidateRange(0,32768)][int]$Context = 0,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
if (-not $Server) { $Server = 'llama-server.exe' }
if (-not $GpuMemoryGB) {
  $gpuMemory = & nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits
  if ($LASTEXITCODE -ne 0 -or -not $gpuMemory) { throw 'Specify -GpuMemoryGB 8 or 12 after checking nvidia-smi.' }
  $GpuMemoryGB = if ([int](@($gpuMemory)[0]) -ge 11000) { 12 } else { 8 }
}
$size = if ($GpuMemoryGB -eq 12) { '7B' } else { '3B' }
if (-not $Context) { $Context = if ($GpuMemoryGB -eq 12) { 16384 } else { 8192 } }
if ($Context -lt 2048) { throw 'Context must be at least 2048 tokens.' }
$alias = 'e2p-vl-rtx3060-' + ($Context / 1024).ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) + 'k'
$arguments = @('--alias',$alias,'--ctx-size',"$Context",'--parallel','1',
  '--n-gpu-layers','all','--flash-attn','on','--cache-type-k','q8_0','--cache-type-v','q8_0',
  '--threads','6','--threads-batch','6','--batch-size','512','--ubatch-size','128',
  '--host','127.0.0.1','--port','8081','--no-webui')
if ($ModelPath) {
  if (-not $ProjectorPath) { throw 'A matching -ProjectorPath is required for a local vision model.' }
  if (-not $DryRun) {
    foreach ($asset in @($ModelPath,$ProjectorPath)) {
      if (-not (Test-Path -LiteralPath $asset -PathType Leaf)) { throw "Missing asset: $asset" }
    }
  }
  $arguments += @('--model',$ModelPath,'--mmproj',$ProjectorPath)
} else {
  $arguments += @('-hf',"ggml-org/Qwen2.5-VL-$size-Instruct-GGUF:Q4_K_M")
}
if ($DryRun) {
  [pscustomobject]@{ executable=$Server; gpuMemoryGB=$GpuMemoryGB; modelSize=$size; context=$Context; arguments=$arguments } | ConvertTo-Json -Depth 4
  exit 0
}
Write-Output "Starting the RTX 3060 baseline: $size, $Context tokens, one slot. Download may be required on first use."
& $Server @arguments
exit $LASTEXITCODE
