const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "..");
const defaultLogsDir = path.join(projectRoot, "logs");

function parseArgs(argv) {
  const options = {
    intervalMs: 2000,
    outputPath: "",
    once: false,
    rootPid: 0
  };

  for (const arg of argv) {
    if (arg === "--once") {
      options.once = true;
      continue;
    }

    if (arg.startsWith("--interval=")) {
      const value = Number(arg.slice("--interval=".length));
      if (Number.isFinite(value)) {
        options.intervalMs = Math.max(1000, Math.min(3000, Math.floor(value)));
      }
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.outputPath = path.resolve(projectRoot, arg.slice("--output=".length));
      continue;
    }

    if (arg.startsWith("--pid=")) {
      const value = Number(arg.slice("--pid=".length));
      if (Number.isFinite(value) && value > 0) {
        options.rootPid = Math.floor(value);
      }
    }
  }

  return options;
}

function formatTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function toMegabytes(value) {
  const numeric = Number(value) || 0;
  return Number((numeric / 1024 / 1024).toFixed(2));
}

function normalizeCommandLine(commandLine) {
  return typeof commandLine === "string" ? commandLine.trim() : "";
}

async function ensureLogFile(outputPath) {
  const resolvedPath = outputPath || path.join(defaultLogsDir, `deskpilot-memory-${formatTimestamp()}.jsonl`);
  await fsp.mkdir(path.dirname(resolvedPath), { recursive: true });
  return resolvedPath;
}

async function collectProcessSnapshot() {
  const script = `
$ErrorActionPreference = 'Stop'
$processInfo = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, WorkingSetSize
$stats = Get-Process | Select-Object Id, PM, WS, CPU, WorkingSet64, PrivateMemorySize64
$statsById = @{}
foreach ($item in $stats) {
  $statsById[[string]$item.Id] = $item
}
$result = foreach ($proc in $processInfo) {
  $stat = $statsById[[string]$proc.ProcessId]
  $workingSet = if ($null -ne $stat -and $null -ne $stat.WorkingSet64) { $stat.WorkingSet64 } elseif ($null -ne $stat -and $null -ne $stat.WS) { $stat.WS } else { $proc.WorkingSetSize }
  $privateBytes = if ($null -ne $stat -and $null -ne $stat.PrivateMemorySize64) { $stat.PrivateMemorySize64 } elseif ($null -ne $stat -and $null -ne $stat.PM) { $stat.PM } else { 0 }
  $cpuSeconds = if ($null -ne $stat -and $null -ne $stat.CPU) { $stat.CPU } else { 0 }
  [PSCustomObject]@{
    pid = [int]$proc.ProcessId
    ppid = [int]$proc.ParentProcessId
    name = [string]$proc.Name
    commandLine = [string]$proc.CommandLine
    workingSetBytes = [int64]$workingSet
    privateBytes = [int64]$privateBytes
    cpuSeconds = [double]$cpuSeconds
  }
}
$result | ConvertTo-Json -Depth 4 -Compress
`;

  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", script], {
    cwd: projectRoot,
    maxBuffer: 16 * 1024 * 1024
  });

  if (!stdout.trim()) {
    return [];
  }

  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function isDeskPilotRootProcess(proc) {
  const name = String(proc.name || "").toLowerCase();
  const commandLine = normalizeCommandLine(proc.commandLine).toLowerCase();
  if (!name) {
    return false;
  }

  if (commandLine.includes(projectRoot.toLowerCase())) {
    return !commandLine.includes("--type=");
  }

  if (name === "deskpilot.exe" && !commandLine.includes("--type=")) {
    return true;
  }

  return false;
}

function classifyProcess(proc) {
  const name = String(proc.name || "");
  const commandLine = normalizeCommandLine(proc.commandLine).toLowerCase();
  if (commandLine.includes("--type=renderer")) {
    return "renderer";
  }
  if (commandLine.includes("--type=gpu-process")) {
    return "gpu";
  }
  if (commandLine.includes("--type=utility")) {
    return "utility";
  }
  if (name.toLowerCase().includes("crashpad")) {
    return "crashpad";
  }
  return "browser";
}

function collectTargetProcesses(processes, rootPid) {
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]));
  const childrenByParentPid = new Map();

  for (const proc of processes) {
    const siblings = childrenByParentPid.get(proc.ppid) || [];
    siblings.push(proc.pid);
    childrenByParentPid.set(proc.ppid, siblings);
  }

  const rootPids = rootPid > 0
    ? [rootPid].filter((pid) => byPid.has(pid))
    : processes.filter(isDeskPilotRootProcess).map((proc) => proc.pid);

  const visited = new Set();
  const queue = [...rootPids];
  while (queue.length > 0) {
    const pid = queue.shift();
    if (!pid || visited.has(pid)) {
      continue;
    }
    visited.add(pid);
    for (const childPid of childrenByParentPid.get(pid) || []) {
      queue.push(childPid);
    }
  }

  return Array.from(visited)
    .map((pid) => byPid.get(pid))
    .filter(Boolean)
    .map((proc) => ({
      ...proc,
      role: classifyProcess(proc),
      workingSetMB: toMegabytes(proc.workingSetBytes),
      privateMB: toMegabytes(proc.privateBytes)
    }))
    .sort((left, right) => right.privateBytes - left.privateBytes);
}

function summarizeByRole(processes) {
  const summary = {};
  for (const proc of processes) {
    const current = summary[proc.role] || {
      count: 0,
      workingSetMB: 0,
      privateMB: 0
    };

    current.count += 1;
    current.workingSetMB = Number((current.workingSetMB + proc.workingSetMB).toFixed(2));
    current.privateMB = Number((current.privateMB + proc.privateMB).toFixed(2));
    summary[proc.role] = current;
  }
  return summary;
}

function buildLogEntry(processes) {
  const timestamp = new Date().toISOString();
  const totalWorkingSetMB = Number(processes.reduce((sum, proc) => sum + proc.workingSetMB, 0).toFixed(2));
  const totalPrivateMB = Number(processes.reduce((sum, proc) => sum + proc.privateMB, 0).toFixed(2));

  return {
    timestamp,
    totalWorkingSetMB,
    totalPrivateMB,
    processCount: processes.length,
    summary: summarizeByRole(processes),
    processes: processes.map((proc) => ({
      pid: proc.pid,
      ppid: proc.ppid,
      name: proc.name,
      role: proc.role,
      workingSetMB: proc.workingSetMB,
      privateMB: proc.privateMB,
      cpuSeconds: Number((Number(proc.cpuSeconds) || 0).toFixed(2)),
      commandLine: normalizeCommandLine(proc.commandLine)
    }))
  };
}

function printConsoleSummary(entry) {
  const parts = [
    `${entry.timestamp}`,
    `totalWS=${entry.totalWorkingSetMB}MB`,
    `totalPrivate=${entry.totalPrivateMB}MB`,
    `processes=${entry.processCount}`
  ];

  for (const [role, info] of Object.entries(entry.summary)) {
    parts.push(`${role}:${info.count}/${info.privateMB}MB`);
  }

  console.log(parts.join(" | "));
}

async function appendLog(logPath, entry) {
  await fsp.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function run() {
  if (process.platform !== "win32") {
    console.error("[DeskPilot] monitor-memory only supports Windows currently.");
    process.exit(1);
  }

  const options = parseArgs(process.argv.slice(2));
  const logPath = await ensureLogFile(options.outputPath);
  let stopped = false;

  async function captureOnce() {
    try {
      const snapshot = await collectProcessSnapshot();
      const processes = collectTargetProcesses(snapshot, options.rootPid);
      const entry = buildLogEntry(processes);
      await appendLog(logPath, entry);
      printConsoleSummary(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const entry = {
        timestamp: new Date().toISOString(),
        error: message
      };
      await appendLog(logPath, entry);
      console.error(`[DeskPilot] monitor-memory error: ${message}`);
    }
  }

  function stop() {
    if (stopped) {
      return;
    }
    stopped = true;
    console.log(`[DeskPilot] memory monitor stopped. log: ${logPath}`);
    process.exit(0);
  }

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(`[DeskPilot] memory monitor started. interval=${options.intervalMs}ms log=${logPath}`);
  if (options.rootPid > 0) {
    console.log(`[DeskPilot] tracking explicit root pid ${options.rootPid}`);
  }

  await captureOnce();
  if (options.once) {
    stop();
    return;
  }

  const timer = setInterval(() => {
    void captureOnce();
  }, options.intervalMs);

  process.on("exit", () => {
    clearInterval(timer);
  });
}

void run();
