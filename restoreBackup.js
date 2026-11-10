const fs = require("fs-extra");
const path = require("path");
const readline = require("readline");
const log = require('./logger/log.js');

let versionBackup;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const SKIP_DIRS = new Set(["backups", "node_modules", ".git"]);

function isSafeVersion(str) {
  if (!str || typeof str !== "string") return false;
  if (str === "." || str === "..") return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(str);
}

function isSafeEntry(name) {
  if (!name || typeof name !== "string") return false;
  if (name === "." || name === "..") return false;
  if (SKIP_DIRS.has(name)) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

async function recursiveReadDirAndBackup(relativePath, backupRoot) {
  const backupPath = path.join(backupRoot, relativePath);
  const restorePath = path.join(process.cwd(), relativePath);

  // Ensure restorePath stays inside cwd
  const cwd = path.resolve(process.cwd());
  const resolvedRestore = path.resolve(restorePath);
  if (resolvedRestore !== cwd && !resolvedRestore.startsWith(cwd + path.sep)) {
    log.warn("RESTORE", `Skip escape attempt: ${relativePath}`);
    return;
  }

  let stat;
  try {
    stat = await fs.lstat(backupPath);
  } catch {
    log.warn("RESTORE", `Skip missing: ${relativePath}`);
    return;
  }

  if (stat.isSymbolicLink()) {
    log.warn("RESTORE", `Skip symlink (security): ${relativePath}`);
    return;
  }

  if (stat.isDirectory()) {
    await fs.ensureDir(restorePath);
    const entries = await fs.readdir(backupPath);
    for (const entry of entries) {
      if (!isSafeEntry(entry)) {
        log.warn("RESTORE", `Skip unsafe entry: ${path.join(relativePath, entry)}`);
        continue;
      }
      await recursiveReadDirAndBackup(path.join(relativePath, entry), backupRoot);
    }
  } else if (stat.isFile()) {
    await fs.ensureDir(path.dirname(restorePath));
    await fs.copy(backupPath, restorePath, { overwrite: true, dereference: false });
  }
}

(async () => {
  try {
    if (process.argv.length < 3) {
      versionBackup = await new Promise((resolve) => {
        rl.question("Input version backup: ", answer => resolve(answer.trim()));
      });
    } else {
      versionBackup = process.argv[2];
    }

    if (!versionBackup) {
      log.err("ERROR", "Please input version backup");
      process.exit(1);
    }

    // sanitize: remove backup_ prefix if user typed it, then validate
    versionBackup = versionBackup.replace(/^backup_/, "").trim();
    if (!isSafeVersion(versionBackup)) {
      log.err("ERROR", `Invalid version name: ${versionBackup} - only letters, numbers, dot, dash, underscore allowed, must start with letter/number`);
      process.exit(1);
    }

    versionBackup = `backup_${versionBackup}`;
    const backupFolder = path.join(process.cwd(), "backups", versionBackup);

    if (!await fs.pathExists(backupFolder)) {
      log.err("ERROR", `Backup folder does not exist (${backupFolder})`);
      process.exit(1);
    }

    const files = await fs.readdir(backupFolder);
    for (const file of files) {
      if (!isSafeEntry(file)) {
        log.warn("RESTORE", `Skip unsafe file name: ${file}`);
        continue;
      }
      await recursiveReadDirAndBackup(file, backupFolder);
    }

    // read package.json fresh (no require cache)
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkgContent = await fs.readJson(pkgPath);
    pkgContent.version = versionBackup.replace(/^backup_/, "");
    await fs.writeJson(pkgPath, pkgContent, { spaces: 2 });

    log.info("SUCCESS", `Restore backup ${versionBackup} success`);
  } catch (err) {
    log.err("ERROR", `Restore failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    rl.close();
  }
})();
