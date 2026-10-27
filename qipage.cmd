@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
set "QIPAGE_ROOT=%~dp0"
set "QIPAGE_ACTION=%~1"
if not defined QIPAGE_ACTION set "QIPAGE_ACTION=launch"
powershell.exe -NoLogo -NoProfile -NonInteractive -Command ^
  "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; $env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+$env:PSModulePath; try {" ^
  "$root=$env:QIPAGE_ROOT; $action=$env:QIPAGE_ACTION; if($action -notin @('launch','background','autostart-on','autostart-off','status')){throw 'Unknown action.'};" ^
  "$version='24.22.1'; $machine=$env:PROCESSOR_ARCHITEW6432; if(-not $machine){$machine=$env:PROCESSOR_ARCHITECTURE};" ^
  "switch($machine){ 'AMD64'{$arch='x64';$hash='d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'} 'ARM64'{$arch='arm64';$hash='a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171'} default{throw 'This launcher requires 64-bit Windows (x64 or ARM64).'}};" ^
  "$runtime=Join-Path $root '.runtime'; $name='node-v'+$version+'-win-'+$arch; $cache=Join-Path $runtime $name; $cachedNode=Join-Path $cache 'node.exe';" ^
  "function Test-Node([string]$file){if(-not $file -or -not (Test-Path -LiteralPath $file -PathType Leaf)){return $false}; try{$v=(& $file --version 2>$null | Select-Object -First 1); return ($LASTEXITCODE -eq 0 -and $v -match '^v(2[2-9]|[3-9][0-9])\.')}catch{return $false}};" ^
  "function Find-Node{$config=Join-Path $root 'node.path.txt'; if(Test-Path -LiteralPath $config -PathType Leaf){$p=([IO.File]::ReadAllText($config)).Trim(); if($p -and -not [IO.Path]::IsPathRooted($p)){$p=Join-Path $root $p}; if(Test-Node $p){return $p}}; $installed=Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1; if($installed -and (Test-Node $installed.Source)){return $installed.Source}; $receipt=Join-Path $cache '.qipage-verified'; if((Test-Path -LiteralPath $receipt -PathType Leaf) -and ([IO.File]::ReadAllText($receipt)).Trim() -eq $hash -and (Test-Node $cachedNode)){return $cachedNode}; return $null};" ^
  "function Check-RuntimePath([string]$p){$full=[IO.Path]::GetFullPath($p); $base=[IO.Path]::GetFullPath($runtime).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar; if(-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe runtime path.'}; return $full};" ^
  "$node=Find-Node; if(-not $node){" ^
  "Write-Host '正在准备栖页运行环境，首次使用需要联网，请稍候...'; New-Item -ItemType Directory -Path $runtime -Force | Out-Null; $lockPath=Join-Path $runtime 'bootstrap.lock'; $lock=$null; $deadline=[DateTime]::UtcNow.AddSeconds(60); while(-not $lock){try{$lock=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch [IO.IOException]{if([DateTime]::UtcNow -ge $deadline){throw '另一个栖页启动窗口正在准备环境，请稍后重试。'}; Start-Sleep -Milliseconds 300}};" ^
  "$stage=$null; try{$node=Find-Node; if(-not $node){" ^
  "$stage=Check-RuntimePath (Join-Path $runtime ('download-'+[Guid]::NewGuid().ToString('N'))); New-Item -ItemType Directory -Path $stage | Out-Null; $zip=Join-Path $stage 'node.zip';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri ('https://nodejs.org/dist/v'+$version+'/'+$name+'.zip') -OutFile $zip;" ^
  "if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash){throw 'Node 下载校验失败，文件不会执行。请重新运行启动程序。'};" ^
  "Expand-Archive -LiteralPath $zip -DestinationPath $stage; $expanded=Check-RuntimePath (Join-Path $stage $name); if(-not (Test-Path -LiteralPath (Join-Path $expanded 'node.exe') -PathType Leaf)){throw 'Node 解压失败，请重试。'};" ^
  "[IO.File]::WriteAllText((Join-Path $expanded '.qipage-verified'),$hash); if(Test-Path -LiteralPath $cache){$bad=Check-RuntimePath (Join-Path $runtime ('old-'+[Guid]::NewGuid().ToString('N'))); Move-Item -LiteralPath (Check-RuntimePath $cache) -Destination $bad}; Move-Item -LiteralPath $expanded -Destination (Check-RuntimePath $cache); $node=Find-Node; if(-not $node){throw 'Node 无法运行，请检查 Windows 版本。'}" ^
  "}}finally{if($stage -and (Test-Path -LiteralPath $stage)){Remove-Item -LiteralPath (Check-RuntimePath $stage) -Recurse -Force}; if($lock){$lock.Dispose()}}" ^
  "}; if($action -eq 'launch'){& $node (Join-Path $root 'launch.cjs')}elseif($action -eq 'background'){& $node (Join-Path $root 'launch.cjs') --background}else{$mode=@{'autostart-on'='install';'autostart-off'='remove';'status'='status'}[$action]; & $node (Join-Path $root 'autostart.cjs') $mode}; exit $LASTEXITCODE" ^
  "}catch{Write-Host ('栖页启动未完成：'+$_.Exception.Message) -ForegroundColor Red; exit 1}"
exit /b %errorlevel%