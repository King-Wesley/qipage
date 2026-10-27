'use strict';
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const marker = 'Qipage local homepage - current user autostart v1';
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";

function startupScript(action, { root = __dirname, nodePath = process.execPath, systemRoot = process.env.SystemRoot || 'C:\\Windows', startupDirectory } = {}) {
  if (!['install', 'remove', 'status'].includes(action)) throw new Error('使用 install、remove 或 status。');
  const launcher = path.join(root, 'launch.cjs');
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = '& ' + quote(nodePath) + ' ' + quote(launcher) + ' --background; exit $LASTEXITCODE';
  const argumentsText = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -Command "' + command + '"';
  return [
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)",
    "$ErrorActionPreference = 'Stop'",
    '$startupDirectory = ' + (startupDirectory ? quote(startupDirectory) : "[Environment]::GetFolderPath('Startup')"),
    "if (-not $startupDirectory -or -not (Test-Path -LiteralPath $startupDirectory -PathType Container)) { throw '找不到当前用户的启动文件夹。' }",
    "$shortcutPath = Join-Path $startupDirectory 'Qipage.lnk'",
    '$shell = New-Object -ComObject WScript.Shell',
    '$exists = Test-Path -LiteralPath $shortcutPath',
    'if ($exists) {',
    '  $existing = $shell.CreateShortcut($shortcutPath)',
    '  if ($existing.Description -ne ' + quote(marker) + ") { throw '已有同名启动项，为避免覆盖请先检查 Qipage.lnk。' }",
    '}',
    '$action = ' + quote(action),
    "if ($action -eq 'install') {",
    '  if (-not (Test-Path -LiteralPath ' + quote(nodePath) + ' -PathType Leaf) -or -not (Test-Path -LiteralPath ' + quote(launcher) + " -PathType Leaf)) { throw '找不到 Node 或栖页启动文件，请保留完整项目文件夹。' }",
    '  $shortcut = $shell.CreateShortcut($shortcutPath)',
    '  $shortcut.TargetPath = ' + quote(powershell),
    '  $shortcut.Arguments = ' + quote(argumentsText),
    '  $shortcut.WorkingDirectory = ' + quote(root),
    '  $shortcut.Description = ' + quote(marker),
    '  $shortcut.WindowStyle = 7',
    '  $shortcut.Save()',
    '  $exists = Test-Path -LiteralPath $shortcutPath',
    "  if (-not $exists) { throw '启动项创建失败。' }",
    '}',
    "if ($action -eq 'remove' -and $exists) {",
    '  Remove-Item -LiteralPath $shortcutPath',
    '  $exists = $false',
    '}',
    '$result = @{ enabled = [bool]$exists; shortcut = $shortcutPath; root = ' + quote(root) + ' }',
    'if ($exists) {',
    '  $saved = $shell.CreateShortcut($shortcutPath)',
    '  $result.target = $saved.TargetPath',
    '  $result.arguments = $saved.Arguments',
    '  $result.workingDirectory = $saved.WorkingDirectory',
    '}',
    '$result | ConvertTo-Json -Compress'
  ].join('\n');
}

function manage(action, options = {}) {
  if (process.platform !== 'win32') throw new Error('此开机自启脚本适用于 Windows。');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', startupScript(action, options)], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || '未能修改开机自启设置。').trim());
  return JSON.parse(result.stdout.trim());
}

if (require.main === module) {
  try {
    const action = process.argv[2] || 'status';
    const result = manage(action);
    console.log(result.enabled ? '已启用：登录 Windows 后，栖页会在后台自动启动。' : '已关闭栖页开机自启。');
    console.log('启动项：' + result.shortcut);
    if (action === 'install') console.log('请保留当前栖页文件夹；移动后请重新运行启用脚本。');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { startupScript, manage, marker };