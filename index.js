const { spawn, execSync } = require("child_process");
const log = require("./logger/log.js");

const REBRAND = [
  [/ST Bot - Enhanced version of GoatBot V2, modified and maintained by Sheikh Tamim\./g,
   "Mysteriousq AI Bot - Custom fork maintained by Siegfried Samá."],
  [/\[!\] The source code should only be downloaded from the official github page:[^\n]*/g,
   "[!] Custom bot maintained by Siegfried Samá."],
  [/\[!\] Thank you for using ST Bot\. Enhanced by Sheikh Tamim[^\n]*/g,
   "[!] Mysteriousq AI Bot — maintained by Siegfried Samá."],
  [/COPYRIGHT: ST Bot v[\d.]+ - Enhanced by Sheikh Tamim[^\n]*/g,
   "COPYRIGHT: Mysteriousq AI Bot — maintained by Siegfried Samá. All rights reserved."],
  [/ST Bot v[\d.]+/g, "Mysteriousq AI Bot"],
  [/ST-Bot/g, "Mysteriousq AI Bot"],
  [/ST Bot/g, "Mysteriousq AI Bot"],
  [/Sheikh Tamim/g, "Siegfried Samá"],
];

function applyRebrand(text) {
  for (const [pattern, replacement] of REBRAND) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

// Kill any orphaned Goat.js or dashboard processes on startup
function killOrphans() {
  try { execSync("pkill -9 -f 'node Goat.js'", { stdio: "ignore" }); } catch (_) {}
  // Also free port 3021 if something is holding it
  try { execSync("fuser -k 3021/tcp", { stdio: "ignore" }); } catch (_) {}
}

let currentChild = null;
let isShuttingDown = false;

function killChild() {
  if (currentChild) {
    try { currentChild.kill("SIGKILL"); } catch (_) {}
    currentChild = null;
  }
}

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  killChild();
  try { execSync("pkill -9 -f 'node Goat.js'", { stdio: "ignore" }); } catch (_) {}
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("exit", killChild);

function startProject() {
  if (isShuttingDown) return;

  const child = spawn(process.execPath, ["-r", require.resolve("./gban-fail-open.js"), "Goat.js"], {
    cwd: __dirname,
    stdio: ["inherit", "pipe", "pipe"],
  });

  currentChild = child;

  child.stdout.on("data", (chunk) => {
    process.stdout.write(applyRebrand(chunk.toString()));
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(applyRebrand(chunk.toString()));
  });

  child.on("close", (code) => {
    if (isShuttingDown) return;
    currentChild = null;
    if (code !== null) {
      log.info(`Bot stopped (exit code: ${code}). Restarting in 5 seconds...`);
      setTimeout(() => startProject(), 5000);
    }
  });

  child.on("error", (err) => {
    if (isShuttingDown) return;
    currentChild = null;
    log.err("index", `Failed to start bot: ${err.message}. Restarting in 5 seconds...`);
    setTimeout(() => startProject(), 5000);
  });
}

// Wipe all orphans first, then start clean
killOrphans();
startProject();
