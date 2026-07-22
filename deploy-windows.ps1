<#
.SYNOPSIS
    Money Tracker Windows Server 一键部署脚本

.DESCRIPTION
    自动完成以下步骤（安全部署，不丢数据）：
      1.  管理员权限检查
      2.  检测/安装 Node.js LTS（MSI 静默安装）
      3.  校验项目源码
      4.  停止已运行的服务（释放文件锁，避免 robocopy 失败）
      5.  备份现有数据库 data/money.db（保留历史数据）
      6.  拷贝项目到目标目录（自动排除 node_modules/dist/.git/data）
      7.  npm install + npm run build + npm prune --omit=dev + 恢复数据库
      8.  下载 NSSM（Non-Sucking Service Manager）
      9.  注册为 Windows 服务（开机自启、崩溃自动重启、日志轮转）
      10. 添加防火墙规则
      11. 启动服务
      12. 健康检查
      13. 输出访问地址

    安全特性：
      - 自动停止旧服务，避免文件占用导致部署失败
      - 升级部署时自动备份并恢复 SQLite 数据库
      - 数据库备份位置： %TEMP%\money-db-backup-<时间戳>\

.ROLE
    必须以管理员身份运行 PowerShell。

.PARAMETER InstallDir
    项目部署目标目录。默认 D:\apps\money-tracker
    建议放在无空格、无中文的路径下。

.PARAMETER Port
    服务监听端口。默认 3001

.PARAMETER ServiceName
    Windows 服务内部名称。默认 MoneyTracker

.PARAMETER ServiceDisplayName
    服务显示名称。默认 "Money Tracker App"

.PARAMETER SourceDir
    项目源码目录。默认为脚本所在目录（即项目根目录）

.PARAMETER NodeVersion
    Node.js 版本号。默认 20.18.0（LTS）

.PARAMETER SkipNodeInstall
    跳过 Node.js 安装（已预装时使用）

.PARAMETER SkipBuild
    跳过 npm run build（dist/ 已预构建时使用）

.PARAMETER Force
    目标目录已存在时清空重建（默认为增量更新，保留 node_modules）

.EXAMPLE
    # 最常用：在项目根目录下，双击 deploy-windows.cmd 即可
    # 或在管理员 PowerShell 中执行：
    .\deploy-windows.ps1

.EXAMPLE
    # 自定义端口和目录
    .\deploy-windows.ps1 -Port 8080 -InstallDir "E:\mt"

.EXAMPLE
    # Node 已预装，仅部署
    .\deploy-windows.ps1 -SkipNodeInstall

.NOTES
    适用系统：Windows Server 2016 / 2019 / 2022 / 2025
    PowerShell 版本：5.1+（系统自带）
    作者：Money Tracker

    如遇 "无法加载脚本" 错误，请使用同目录下的 deploy-windows.cmd 启动，
    或手动执行：powershell -ExecutionPolicy Bypass -File .\deploy-windows.ps1
#>

param(
    [string]$InstallDir = "C:\Users\Administrator\Documents\Money-Book",
    [int]$Port = 3001,
    [string]$ServiceName = "MoneyTracker",
    [string]$ServiceDisplayName = "Money Tracker App",
    [string]$SourceDir = $PSScriptRoot,
    [string]$NodeVersion = "20.18.0",
    [string]$NSSMVersion = "2.24",
    [switch]$SkipNodeInstall,
    [switch]$SkipBuild,
    [switch]$Force
)

# ============== 全局设置 ==============
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# NSSM 路径（提前定义，停服务步骤会用到）
$nssmBaseDir = "C:\nssm"
$nssmExe = Join-Path $nssmBaseDir "nssm.exe"

# FIX: 强制 TLS 1.2，避免 Server 2016 默认 TLS 1.0 下载失败
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
    Write-Host "[WARN] 无法设置 TLS 1.2，下载可能失败: $_" -ForegroundColor Yellow
}

# ============== 日志辅助 ==============
# FIX: 函数名避免与内置 Write-Warning 冲突
function Write-StepMsg { param($msg) Write-Host "`n[STEP] $msg" -ForegroundColor Cyan }
function Write-OkMsg { param($msg) Write-Host "  [OK]  $msg" -ForegroundColor Green }
function Write-WarnMsg { param($msg) Write-Host "  [WARN]$msg" -ForegroundColor Yellow }
function Write-ErrMsg { param($msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }

# ============== 0. 启动横幅 ==============
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Money Tracker - Windows Server Deployment" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  InstallDir   : $InstallDir"
Write-Host "  Port         : $Port"
Write-Host "  ServiceName  : $ServiceName"
Write-Host "  SourceDir    : $SourceDir"
Write-Host "  NodeVersion  : $NodeVersion"
Write-Host "  SkipNodeInst : $SkipNodeInstall"
Write-Host "  SkipBuild    : $SkipBuild"
Write-Host "  Force        : $Force"
Write-Host "==========================================================" -ForegroundColor Cyan

# ============== 1. 管理员权限检查 ==============
Write-StepMsg "检查管理员权限..."
$currentUser = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-ErrMsg "请以管理员身份运行 PowerShell！"
    Write-Host ""
    Write-Host "  解决方法（任选其一）：" -ForegroundColor Yellow
    Write-Host "    1. 右键 PowerShell -> '以管理员身份运行'，再执行此脚本" -ForegroundColor Yellow
    Write-Host "    2. 双击同目录下的 deploy-windows.cmd（会自动提权）" -ForegroundColor Yellow
    exit 1
}
Write-OkMsg "已是管理员"

# ============== 2. Node.js 检测/安装 ==============
Write-StepMsg "检查 Node.js..."
$needInstallNode = $true

# 优先检查 PATH
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    # 检查默认安装路径
    $defaultNodePath = Join-Path $env:ProgramFiles "nodejs\node.exe"
    if (Test-Path $defaultNodePath) {
        $env:Path = "$env:ProgramFiles\nodejs;" + $env:Path
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    }
}

if ($nodeCmd) {
    try {
        $nodeVerRaw = & node -v 2>$null
        if ($LASTEXITCODE -eq 0 -and $nodeVerRaw) {
            $nodeVer = $nodeVerRaw -replace 'v', ''
            $nodeMajor = [int]($nodeVer.Split('.')[0])
            if ($nodeMajor -ge 18) {
                Write-OkMsg "已安装 Node.js v$nodeVer"
                $needInstallNode = $false
            } else {
                Write-WarnMsg " Node.js 版本过低 (v$nodeVer)，需要 >= 18，将升级"
            }
        }
    } catch {
        Write-WarnMsg " Node.js 检测异常: $_"
    }
}

if ($needInstallNode -and -not $SkipNodeInstall) {
    Write-StepMsg "下载并安装 Node.js v$NodeVersion ..."
    $msiUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-x64.msi"
    $msiPath = Join-Path $env:TEMP "node-v$NodeVersion-x64.msi"

    Write-Host "  下载: $msiUrl"
    try {
        Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
    } catch {
        Write-ErrMsg "下载失败: $_"
        Write-Host "  请手动从 https://nodejs.org/ 下载 LTS 版并安装" -ForegroundColor Yellow
        exit 1
    }
    Write-OkMsg "下载完成"

    Write-Host "  正在静默安装（可能需要 1-2 分钟）..."
    $proc = Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait -PassThru
    # FIX: msiexec 退出码 0=成功, 3010=需重启(也视为成功), 1638=已装新版(视为成功)
    $successCodes = @(0, 3010, 1638)
    if ($proc.ExitCode -notin $successCodes) {
        Write-ErrMsg "Node.js 安装失败，msiexec 退出码: $($proc.ExitCode)"
        Write-Host "  常见原因：权限不足、msi 损坏、磁盘空间不足" -ForegroundColor Yellow
        exit 1
    }
    if ($proc.ExitCode -eq 3010) {
        Write-WarnMsg " 安装成功，但系统提示需要重启才能完全生效"
    } elseif ($proc.ExitCode -eq 1638) {
        Write-WarnMsg " 已安装更新版本，跳过"
    }

    # 刷新当前会话的环境变量
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"

    # 再次验证（可能需要刷新 PATH 缓存）
    $nodeFound = $false
    foreach ($try in 1..3) {
        if (Get-Command node -ErrorAction SilentlyContinue) {
            $nodeFound = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }
    # 兜底：直接检查默认路径
    if (-not $nodeFound) {
        $defaultNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
        if (Test-Path $defaultNode) {
            $env:Path = "$env:ProgramFiles\nodejs;" + $env:Path
            $nodeFound = $true
        }
    }

    if ($nodeFound) {
        Write-OkMsg "Node.js 安装成功: $(& node -v 2>$null)"
    } else {
        Write-ErrMsg "Node.js 已安装但当前会话未生效"
        Write-Host "  请关闭并重新打开 PowerShell，再次运行此脚本（加 -SkipNodeInstall）" -ForegroundColor Yellow
        exit 1
    }

    Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
} elseif ($needInstallNode -and $SkipNodeInstall) {
    Write-WarnMsg " -SkipNodeInstall 已指定，但 Node 未安装/版本过低，后续步骤将失败"
    exit 1
}

# 验证 npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    # 兜底
    $defaultNpm = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
    if (Test-Path $defaultNpm) {
        $env:Path = "$env:ProgramFiles\nodejs;" + $env:Path
        $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    }
}
if (-not $npmCmd) {
    Write-ErrMsg "找不到 npm，请检查 Node.js 安装"
    exit 1
}
Write-OkMsg "npm 版本: $(& npm -v 2>$null)"

# ============== 3. 源码检查 ==============
Write-StepMsg "校验项目源码..."
if (-not $SourceDir) { $SourceDir = $PSScriptRoot }
if (-not $SourceDir) { $SourceDir = (Get-Location).Path }
$pkgPath = Join-Path $SourceDir "package.json"
if (-not (Test-Path $pkgPath)) {
    Write-ErrMsg "在 $SourceDir 找不到 package.json"
    Write-Host "  请将此脚本放到项目根目录（含 package.json 的目录）" -ForegroundColor Yellow
    exit 1
}
Write-OkMsg "package.json 已找到"

# ============== 4. 停止已运行的服务（释放文件锁）==============
# 关键：必须在拷贝/清空目录前停止服务，否则 robocopy 会因文件被占用报错 16
Write-StepMsg "检查并停止已运行的服务..."
$script:existingSvcWasRunning = $false
$existingSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingSvc) {
    if ($existingSvc.Status -eq 'Running') {
        Write-Host "  服务 [$ServiceName] 正在运行，正在停止..."
        try {
            Stop-Service -Name $ServiceName -Force -ErrorAction Stop
            Start-Sleep -Seconds 2
        } catch {
            Write-WarnMsg " Stop-Service 失败: $_"
            if (Test-Path $nssmExe) {
                Write-Host "  尝试通过 NSSM / taskkill 强制停止..." -ForegroundColor Yellow
                & $nssmExe stop $ServiceName 2>&1 | Out-Null
                Start-Sleep -Seconds 2
            } else {
                Write-Host "  尝试通过 taskkill 强制停止..." -ForegroundColor Yellow
            }
        }
        # 兜底：确认进程已退出
        $svcPid = (Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue).ProcessId
        if ($svcPid -and $svcPid -ne 0) {
            Write-WarnMsg " 服务进程仍在运行 (PID: $svcPid)，强制终止"
            taskkill /F /PID $svcPid 2>&1 | Out-Null
            Start-Sleep -Seconds 2
        }
        $script:existingSvcWasRunning = $true
        Write-OkMsg "服务已停止"
    } else {
        Write-OkMsg "服务已存在但未运行（状态: $($existingSvc.Status)）"
    }
} else {
    Write-OkMsg "服务尚未注册（首次部署）"
}

# ============== 5. 备份现有数据库（如存在）==============
# 关键：在 -Force 清空目录前备份 data/money.db，部署后恢复
Write-StepMsg "备份现有数据库..."
$script:dbBackupDir = $null
$dataDirExisting = Join-Path $InstallDir "data"
$existingDb = Join-Path $dataDirExisting "money.db"
if (Test-Path $existingDb) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $script:dbBackupDir = Join-Path $env:TEMP "money-db-backup-$stamp"
    New-Item -ItemType Directory -Force -Path $script:dbBackupDir | Out-Null

    # 备份所有 .db 相关文件（主库 + WAL + SHM）
    $dbFiles = Get-ChildItem -Path $dataDirExisting -Filter "money.db*" -ErrorAction SilentlyContinue
    foreach ($f in $dbFiles) {
        Copy-Item $f.FullName (Join-Path $script:dbBackupDir $f.Name) -Force
    }
    $sizeKb = [math]::Round((Get-Item $existingDb).Length / 1KB, 1)
    Write-OkMsg "已备份数据库 (${sizeKb}KB) 到: $script:dbBackupDir"
    Write-Host "  备份文件: $((Get-ChildItem $script:dbBackupDir).Name -join ', ')"
} else {
    Write-OkMsg "无现有数据库（首次部署或未初始化数据）"
}

# ============== 6. 拷贝项目文件 ==============
Write-StepMsg "部署项目到 $InstallDir ..."
if (Test-Path $InstallDir) {
    if ($Force) {
        Write-WarnMsg " 目标目录已存在，-Force 模式：清空重建"
        Remove-Item -Recurse -Force $InstallDir
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    } else {
        Write-OkMsg "目标目录已存在，增量更新（保留 node_modules）"
    }
} else {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Write-OkMsg "目标目录已创建"
}

# FIX: robocopy 调用，用 2>&1 合并 stderr 避免触发 $ErrorActionPreference=Stop
Write-Host "  正在拷贝项目文件..."
$roboArgs = @(
    $SourceDir, $InstallDir,
    '/E',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NP',
    '/XD',
    (Join-Path $SourceDir 'node_modules'),
    (Join-Path $SourceDir 'dist'),
    (Join-Path $SourceDir '.git'),
    (Join-Path $SourceDir 'data'),
    '/XF',
    '.env', '.env.local'
)
# 临时切换为 Continue，避免 robocopy 的 stderr 输出导致脚本中断
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& robocopy.exe @roboArgs 2>&1 | Out-Null
$roboExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
# robocopy 退出码 0-7 均为成功，>= 8 为错误
if ($roboExit -ge 8) {
    Write-ErrMsg "拷贝失败，robocopy 退出码: $roboExit"
    exit 1
}
Write-OkMsg "项目文件拷贝完成"

# ============== 5. 安装依赖 + 构建 ==============
Push-Location $InstallDir
try {
    Write-StepMsg "安装依赖（npm install）..."
    # FIX: 临时切换 ErrorActionPreference，npm 写 stderr 不会中断
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & cmd /c "npm install --no-audit --no-fund 2>&1" | Out-Host
    $npmExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEAP
    if ($npmExit -ne 0) {
        Write-ErrMsg "npm install 失败 (exit $npmExit)"
        Write-Host ""
        Write-Host "  常见原因与解决：" -ForegroundColor Yellow
        Write-Host "    [1] better-sqlite3 原生模块编译失败" -ForegroundColor Yellow
        Write-Host "        → 请检查 package.json 中 better-sqlite3 版本应为 11.5.0（有 Node 20/win32 预编译）" -ForegroundColor Yellow
        Write-Host "        → 如仍失败，安装 VS Build Tools（含 C++）：" -ForegroundColor Yellow
        Write-Host "             winget install Microsoft.VisualStudio.2022.BuildTools --override `"--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive`"" -ForegroundColor Yellow
        Write-Host "    [2] 网络问题导致下载失败" -ForegroundColor Yellow
        Write-Host "        → 设置镜像：npm config set registry https://registry.npmmirror.com" -ForegroundColor Yellow
        Write-Host "    [3] 权限问题" -ForegroundColor Yellow
        Write-Host "        → 确认以管理员运行，且 $InstallDir 当前用户可写" -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }
    Write-OkMsg "依赖安装完成"

    if (-not $SkipBuild) {
        Write-StepMsg "构建前端（npm run build）..."
        $prevEAP = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & cmd /c "npm run build 2>&1" | Out-Host
        $buildExit = $LASTEXITCODE
        $ErrorActionPreference = $prevEAP
        if ($buildExit -ne 0) {
            Write-ErrMsg "构建失败 (exit $buildExit)"
            exit 1
        }
        # 验证 dist 是否生成
        $distIndex = Join-Path $InstallDir 'dist\index.html'
        if (-not (Test-Path $distIndex)) {
            Write-ErrMsg "构建后未找到 $distIndex"
            exit 1
        }
        Write-OkMsg "前端构建完成"
    } else {
        Write-WarnMsg " 已跳过构建（-SkipBuild）"
    }

    Write-StepMsg "清理开发依赖（减小体积）..."
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & cmd /c "npm prune --omit=dev 2>&1" 1>$null
    $ErrorActionPreference = $prevEAP
    Write-OkMsg "清理完成"

    # ============== 恢复备份数据库 ==============
    # 关键：把部署前备份的 data/money.db 恢复回去，保留用户的历史数据
    if ($script:dbBackupDir -and (Test-Path $script:dbBackupDir)) {
        Write-StepMsg "恢复历史数据库..."
        $newDataDir = Join-Path $InstallDir "data"
        if (-not (Test-Path $newDataDir)) {
            New-Item -ItemType Directory -Force -Path $newDataDir | Out-Null
        }
        $backupFiles = Get-ChildItem -Path $script:dbBackupDir -ErrorAction SilentlyContinue
        foreach ($f in $backupFiles) {
            Copy-Item $f.FullName (Join-Path $newDataDir $f.Name) -Force
        }
        $restoredDb = Join-Path $newDataDir "money.db"
        if (Test-Path $restoredDb) {
            $sizeKb = [math]::Round((Get-Item $restoredDb).Length / 1KB, 1)
            Write-OkMsg "已恢复数据库 (${sizeKb}KB)，历史数据保留"
        } else {
            Write-WarnMsg " 备份目录为空，首次启动将自动初始化演示数据"
        }
    } else {
        Write-StepMsg "无需恢复数据库（首次部署）"
        Write-OkMsg "首次启动将自动初始化演示数据"
    }
} finally {
    Pop-Location
}

# ============== 8. 下载并安装 NSSM ==============

if (Test-Path $nssmExe) {
    Write-StepMsg "NSSM 已存在，跳过下载"
    Write-OkMsg "路径: $nssmExe"
} else {
    Write-StepMsg "下载 NSSM v$NSSMVersion ..."
    New-Item -ItemType Directory -Force -Path $nssmBaseDir | Out-Null

    $nssmUrl = "https://nssm.cc/release/nssm-$NSSMVersion.zip"
    $zipPath = Join-Path $env:TEMP "nssm-$NSSMVersion.zip"
    $extractDir = Join-Path $env:TEMP "nssm-extract"

    Write-Host "  下载: $nssmUrl"
    try {
        Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath -UseBasicParsing
    } catch {
        Write-ErrMsg "下载失败: $_"
        Write-Host "  可手动从 https://nssm.cc/ 下载并解压到 C:\nssm\nssm.exe" -ForegroundColor Yellow
        exit 1
    }
    Write-OkMsg "下载完成"

    if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
    try {
        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    } catch {
        Write-ErrMsg "解压失败: $_"
        exit 1
    }

    # 优先使用 win64 版本
    $candidatePaths = @(
        (Join-Path $extractDir "nssm-$NSSMVersion\win64\nssm.exe"),
        (Join-Path $extractDir "nssm-$NSSMVersion\win32\nssm.exe")
    )
    $nssmSrc = $null
    foreach ($p in $candidatePaths) {
        if (Test-Path $p) { $nssmSrc = $p; break }
    }
    if (-not $nssmSrc) {
        Write-ErrMsg "解压后未找到 nssm.exe"
        exit 1
    }

    Copy-Item $nssmSrc $nssmExe -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-OkMsg "NSSM 已安装到 $nssmExe"
}

# ============== 7. 注册 Windows 服务 ==============
Write-StepMsg "注册 Windows 服务 [$ServiceName] ..."

# 若已存在同名服务，先停止并删除
$existingSvc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingSvc) {
    Write-WarnMsg " 已存在同名服务"
    if ($existingSvc.Status -eq 'Running') {
        Write-Host "  停止运行中的服务..."
        Stop-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
    }
    & $nssmExe remove $ServiceName confirm 2>&1 | Out-Null
    Write-OkMsg "已删除旧服务"
}

# 定位 node.exe
$nodeExe = $null
$nodeCmdNow = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmdNow) { $nodeExe = $nodeCmdNow.Source }
if (-not $nodeExe -or -not (Test-Path $nodeExe)) {
    $nodeExe = Join-Path $env:ProgramFiles "nodejs\node.exe"
}
if (-not (Test-Path $nodeExe)) {
    Write-ErrMsg "找不到 node.exe"
    exit 1
}

# 定位 tsx CLI（兼容不同 tsx 版本的文件布局）
$tsxCli = $null
$tsxCandidates = @(
    (Join-Path $InstallDir "node_modules\tsx\dist\cli.mjs"),
    (Join-Path $InstallDir "node_modules\tsx\dist\cli.js"),
    (Join-Path $InstallDir "node_modules\.bin\tsx")
)
foreach ($p in $tsxCandidates) {
    if (Test-Path $p) { $tsxCli = $p; break }
}
if (-not $tsxCli) {
    Write-ErrMsg "找不到 tsx CLI"
    Write-Host "  已尝试以下路径：" -ForegroundColor Yellow
    foreach ($p in $tsxCandidates) { Write-Host "    - $p" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "  常见原因：" -ForegroundColor Yellow
    Write-Host "    1. package.json 中 tsx 误放在 devDependencies，被 npm prune --omit=dev 删除" -ForegroundColor Yellow
    Write-Host "       解决：把 tsx 移到 dependencies" -ForegroundColor Yellow
    Write-Host "    2. npm install 未成功" -ForegroundColor Yellow
    Write-Host "       解决：手动运行 cd $InstallDir ; npm install 验证" -ForegroundColor Yellow
    exit 1
}
Write-OkMsg "tsx CLI: $tsxCli"

# 创建日志目录
$logDir = Join-Path $InstallDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# 注册服务：根据 tsx CLI 类型决定命令行
# - cli.mjs / cli.js : node.exe + cli 路径
# - .bin/tsx (shim)  : 用 cmd /c 包装
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
if ($tsxCli -match '\.(mjs|js)$') {
    & $nssmExe install $ServiceName $nodeExe "`"$tsxCli`" api/server.ts" 2>&1 | Out-Null
} else {
    # .bin/tsx 是 shim，交给 cmd 包装
    & $nssmExe install $ServiceName "cmd.exe" "/c `"$tsxCli`" api/server.ts" 2>&1 | Out-Null
}
$nssmInstallExit = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($nssmInstallExit -ne 0) {
    Write-ErrMsg "nssm install 失败 (exit $nssmInstallExit)"
    exit 1
}

# 配置服务参数（逐条设置，忽略 stderr）
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $nssmExe set $ServiceName AppDirectory $InstallDir 2>&1 | Out-Null
& $nssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production" "PORT=$Port" 2>&1 | Out-Null
& $nssmExe set $ServiceName DisplayName $ServiceDisplayName 2>&1 | Out-Null
& $nssmExe set $ServiceName Description "Money Tracker personal accounting app (Node.js)" 2>&1 | Out-Null
& $nssmExe set $ServiceName Start SERVICE_AUTO_START 2>&1 | Out-Null
& $nssmExe set $ServiceName AppStdout (Join-Path $logDir 'out.log') 2>&1 | Out-Null
& $nssmExe set $ServiceName AppStderr (Join-Path $logDir 'err.log') 2>&1 | Out-Null
& $nssmExe set $ServiceName AppRotateFiles 1 2>&1 | Out-Null
& $nssmExe set $ServiceName AppRotateBytes 10485760 2>&1 | Out-Null
& $nssmExe set $ServiceName AppStopMethodConsole 5000 2>&1 | Out-Null
& $nssmExe set $ServiceName AppStopMethodWindow 5000 2>&1 | Out-Null
& $nssmExe set $ServiceName AppRestartDelay 5000 2>&1 | Out-Null
& $nssmExe set $ServiceName AppExit Default Restart 2>&1 | Out-Null
$ErrorActionPreference = $prevEAP

Write-OkMsg "服务已注册"

# ============== 10. 防火墙规则 ==============
Write-StepMsg "添加防火墙规则（放行 $Port/TCP）..."
$ruleName = "Money Tracker ($Port)"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
    try {
        New-NetFirewallRule -DisplayName $ruleName `
            -Description "Allow inbound TCP to Money Tracker service" `
            -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow `
            -Profile Any -ErrorAction Stop | Out-Null
        Write-OkMsg "防火墙规则已添加"
    } catch {
        Write-WarnMsg " 防火墙规则添加失败（不影响服务启动）: $_"
    }
} else {
    Write-OkMsg "防火墙规则已存在"
}

# ============== 9. 启动服务 ==============
Write-StepMsg "启动服务..."
try {
    Start-Service -Name $ServiceName -ErrorAction Stop
} catch {
    Write-ErrMsg "启动失败: $_"
    Write-Host "  查看日志: notepad `"$logDir\err.log`"" -ForegroundColor Yellow
    exit 1
}

Start-Sleep -Seconds 4

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc -or $svc.Status -ne 'Running') {
    $status = if ($svc) { $svc.Status } else { 'NotFound' }
    Write-ErrMsg "服务未运行，状态: $status"
    Write-Host "  查看日志: notepad `"$logDir\err.log`"" -ForegroundColor Yellow
    exit 1
}
$svcPid = (Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue).ProcessId
Write-OkMsg "服务已启动 (PID: $svcPid)"

# ============== 12. 健康检查 ==============
Write-StepMsg "健康检查..."
$healthOk = $false
for ($i = 1; $i -le 5; $i++) {
    Start-Sleep -Seconds 2
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $healthOk = $true
            Write-OkMsg "健康检查通过 (第 ${i} 次尝试)"
            break
        }
    } catch {
        Write-Host "  第 $i 次尝试未就绪，等待重试..."
    }
}
if (-not $healthOk) {
    Write-WarnMsg " 健康检查未通过（服务可能仍在启动中）"
    Write-Host "  稍候手动验证: curl http://localhost:$Port/api/health" -ForegroundColor Yellow
    Write-Host "  查看日志: notepad `"$logDir\out.log`"" -ForegroundColor Yellow
}

# ============== 13. 完成 ==============
$ipList = @()
try {
    $ipList = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -ExpandProperty IPAddress -First 3
} catch {
    # 忽略 IP 获取失败
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  [DONE] 部署完成！" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  访问地址:" -ForegroundColor White
Write-Host "    http://localhost:$Port/"
if ($ipList) {
    foreach ($ip in $ipList) {
        Write-Host "    http://${ip}:$Port/"
    }
}
Write-Host ""
Write-Host "  API:" -ForegroundColor White
Write-Host "    http://localhost:$Port/api/v1/"
Write-Host "    http://localhost:$Port/api/health"
Write-Host ""
Write-Host "  项目目录:    $InstallDir" -ForegroundColor White
Write-Host "  服务名称:    $ServiceName" -ForegroundColor White
Write-Host "  日志文件:    $logDir\out.log / err.log" -ForegroundColor White
Write-Host "  数据库:      $InstallDir\data\money.db" -ForegroundColor White
if ($script:dbBackupDir -and (Test-Path $script:dbBackupDir)) {
    Write-Host "  数据库备份:  $script:dbBackupDir" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "  常用管理命令:" -ForegroundColor White
Write-Host "    Start-Service $ServiceName                  # 启动" -ForegroundColor Gray
Write-Host "    Stop-Service $ServiceName                   # 停止" -ForegroundColor Gray
Write-Host "    Restart-Service $ServiceName                # 重启" -ForegroundColor Gray
Write-Host "    Get-Service $ServiceName                    # 查看状态" -ForegroundColor Gray
Write-Host "    & '$nssmExe' edit $ServiceName        # 图形化编辑参数" -ForegroundColor Gray
Write-Host "    & '$nssmExe' remove $ServiceName confirm  # 卸载服务" -ForegroundColor Gray
Write-Host ""
Write-Host "  更新代码后重新部署（自动备份/恢复数据库）:" -ForegroundColor White
Write-Host "    powershell -ExecutionPolicy Bypass -File .\deploy-windows.ps1 -Port $Port -Force" -ForegroundColor Gray
Write-Host ""
Write-Host "  手动备份数据库:" -ForegroundColor White
Write-Host "    Copy-Item `"$InstallDir\data\money.db`" `"$env:USERPROFILE\Desktop\money-backup.db`"" -ForegroundColor Gray
Write-Host ""
