const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const log = require("./logger/log.js");

function killOrphans() {
  for (const cmd of ["pkill -9 -f 'node Goat.js'", "fuser -k 3021/tcp"]) {
    try {
      execSync(cmd, { stdio: "ignore", timeout: 3000 });
    } catch {}
  }
}

let currentChild = null;
let isShuttingDown = false;
let restartCount = 0;
let lastRestart = 0;

function killChild() {
  if (currentChild) {
    try { currentChild.kill("SIGKILL"); } catch {}
    currentChild = null;
  }
}

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  killChild();
  try { execSync("pkill -9 -f 'node Goat.js'", { stdio: "ignore", timeout: 3000 }); } catch {}
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("exit", killChild);

function getBackoffDelay() {
  const now = Date.now();
  if (now - lastRestart > 60000) restartCount = 0;
  lastRestart = now;
  restartCount++;
  if (restartCount > 10) {
    log.err("index", "Too many restarts (10 in 1 min). Waiting 60s before retry.");
    return 60000;
  }
  if (restartCount > 5) return 15000;
  return 5000;
}

function startProject() {
  if (isShuttingDown) return;

  let preload = [];
  const gbanPath = path.join(__dirname, "gban-fail-open.js");
  if (fs.existsSync(gbanPath)) {
    try {
      preload = ["-r", require.resolve(gbanPath)];
    } catch (e) {
      log.warn("index", `gban preload not found: ${e.message}, starting without it`);
    }
  }

  const child = spawn(process.execPath, [...preload, "Goat.js"], {
    cwd: __dirname,
    stdio: "inherit"
  });

  currentChild = child;

  child.on("close", (code) => {
    if (isShuttingDown) return;
    currentChild = null;
    const delay = getBackoffDelay();
    log.info(`Bot stopped (exit code: ${code}). Restarting in ${delay/1000}s... (attempt ${restartCount})`);
    setTimeout(() => startProject(), delay);
  });

  child.on("error", (err) => {
    if (isShuttingDown) return;
    currentChild = null;
    const delay = getBackoffDelay();
    log.err("index", `Failed to start bot: ${err.message}. Restarting in ${delay/1000}s...`);
    setTimeout(() => startProject(), delay);
  });
}

killOrphans();
startProject();
