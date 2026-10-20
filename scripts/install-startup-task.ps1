[CmdletBinding(SupportsShouldProcess)]
param([string]$TaskName='E2P', [string]$Node=(Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$action=New-ScheduledTaskAction -Execute $Node -Argument ('"' + (Join-Path $PSScriptRoot 'run-unattended.cjs') + '"') -WorkingDirectory $root
$trigger=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
if ($PSCmdlet.ShouldProcess($TaskName,'Register an E2P task at this user logon')) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw 'Task already exists; inspect it before replacing.' }
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'E2P and local model supervisor; starts at user logon.' | Out-Null
  Write-Output "Registered $TaskName. To remove: Unregister-ScheduledTask -TaskName '$TaskName'"
}
