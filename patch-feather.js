#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { spawnSync } = require("child_process");
const readline = require("readline");
const os = require("os");

const APP_INFO = {
  name: "Feather Utility",
  version: "1.0.0",
};

const AGENT_INFO = {
  owner: "AnvilTweaks",
  repo: "AnvilAgent",
  dirName: ".anvil-agent",
  configName: "config.properties",
};

const PATH_SELECTORS = {
  mainBundle: "dist/main.bundle.js",
  preloadLaunchFork: "dist/electron-launcher/preload/preload-launch-fork.js",
  rendererDirs: ["dist/launcher", "dist/launcher-log", "dist/launcher-chat"],
  preloadStubs: [
    "dist/electron-launcher/preload/preload-ad.js",
    "dist/electron-launcher/preload/tcf/tcf-preload-main.js",
    "dist/electron-launcher/preload/tcf/tcf-preload-log.js",
  ],
};

const COMMANDS = new Set(["menu", "patch", "restore", "repair", "agent", "config"]);

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const style = {
  reset: (text) => (useColor ? `\x1b[0m${text}` : text),
  bold: (text) => (useColor ? `\x1b[1m${text}\x1b[22m` : text),
  dim: (text) => (useColor ? `\x1b[2m${text}\x1b[22m` : text),
  red: (text) => (useColor ? `\x1b[31m${text}\x1b[39m` : text),
  green: (text) => (useColor ? `\x1b[32m${text}\x1b[39m` : text),
  yellow: (text) => (useColor ? `\x1b[33m${text}\x1b[39m` : text),
  blue: (text) => (useColor ? `\x1b[34m${text}\x1b[39m` : text),
  magenta: (text) => (useColor ? `\x1b[35m${text}\x1b[39m` : text),
  cyan: (text) => (useColor ? `\x1b[36m${text}\x1b[39m` : text),
  gray: (level, text) => (useColor ? `\x1b[38;5;${level}m${text}\x1b[0m` : text),
};

const log = {
  info: (msg) => console.log(`${style.blue("ℹ")} ${msg}`),
  step: (label, msg) => console.log(`${style.cyan(label.padEnd(10))} ${msg}`),
  success: (msg) => console.log(`${style.green("✔")} ${msg}`),
  warn: (msg) => console.log(`${style.yellow("⚠")} ${msg}`),
  error: (msg) => {
    console.error(`\n${style.red("error")}: ${msg}`);
    process.exit(1);
  },
};

function platformLabel() {
  if (process.platform === "darwin") return "macOS";
  if (process.platform === "win32") return "Windows";
  return process.platform;
}

function defaultAppPath() {
  if (process.platform === "darwin") return "/Applications/Feather Launcher.app";
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "Programs", "feather", "Feather Launcher.exe");
  }
  return path.join(os.homedir(), ".local", "share", "feather-launcher");
}

function windowsLauncherCandidates(inputPath = defaultAppPath()) {
  if (process.platform !== "win32") return [inputPath];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [];
  const add = (candidate) => {
    if (candidate && !candidates.some((item) => item.toLowerCase() === candidate.toLowerCase())) candidates.push(candidate);
  };

  add(inputPath);
  if (path.extname(inputPath).toLowerCase() === ".exe") add(path.dirname(inputPath));
  if (path.basename(inputPath).toLowerCase() === "resources") add(path.dirname(inputPath));

  add(path.join(localAppData, "Programs", "feather", "Feather Launcher.exe"));
  add(path.join(localAppData, "Programs", "feather"));
  add(path.join(localAppData, "Programs", "feather-launcher", "Feather Launcher.exe"));
  add(path.join(localAppData, "Programs", "feather-launcher"));
  add(path.join(localAppData, "Programs", "Feather Launcher", "Feather Launcher.exe"));
  add(path.join(localAppData, "Programs", "Feather Launcher"));
  add(path.join(localAppData, "feather-launcher", "Feather Launcher.exe"));
  add(path.join(localAppData, "feather-launcher"));
  add(path.join(localAppData, "Feather Launcher", "Feather Launcher.exe"));
  add(path.join(localAppData, "Feather Launcher"));

  return candidates;
}

function osHome() {
  return os.homedir();
}

function anvilAgentDir() {
  return path.join(osHome(), AGENT_INFO.dirName);
}

function banner() {
  return [
    style.gray(255, `  ${APP_INFO.name}`),
    style.gray(250, "  local launcher utility"),
    style.gray(245, "  " + "─".repeat(28)),
  ].join("\n");
}

function menuBanner() {
  const border = style.magenta("╒" + "═".repeat(38) + "╕");
  const bottomBorder = style.magenta("╘" + "═".repeat(38) + "╛");

  return [
    border,
    style.gray(255, `  ${style.bold(APP_INFO.name)}`),
    style.gray(250, "  local launcher utility"),
    bottomBorder,
    `${style.gray(250, "  Utility")} ${style.gray(255, APP_INFO.version)} ${style.magenta("•")} ${style.gray(250, "Feather Launcher")} ${style.magenta("•")} ${style.gray(250, platformLabel())}`,
  ].join("\n");
}

function menuText() {
  return `${menuBanner()}

${style.magenta("  " + "─".repeat(20))} ${style.bold("Main Menu")} ${style.magenta("─".repeat(20))}

  ${style.magenta("[1]")}  Patch Feather Launcher
  ${style.magenta("[2]")}  Restore original backup
  ${style.magenta("[3]")}  Repair and re-sign
  ${style.magenta("[4]")}  Update Anvil Agent
  ${style.magenta("[5]")}  Agent settings
  ${style.dim("[q]")  }  Quit
`;
}

function printHelp() {
  console.log(`${banner()}

${style.bold("Version")}
  ${APP_INFO.version}

${style.bold("Usage")}
  feather-patcher
  feather-patcher [command] [app-path]
  feather-patcher [command] --app <app-path>

${style.bold("Commands")}
  menu      Open the interactive menu
  patch      Apply the local no-ad/layout patch
  restore    Restore the original backups made by this tool
  repair     Restore backups if present, then ad-hoc re-sign
  agent      Download the latest Anvil Agent release jar
  config     Open the local Anvil Agent settings menu

${style.bold("Options")}
  --app       Path to Feather Launcher.app, Feather Launcher.exe, or resources directory
  --help      Show this help
  --version   Show version

${style.bold("Default App")}
  ${defaultAppPath()}

${style.dim("Run without arguments to open the interactive menu.")}
${style.dim("Set NO_COLOR=1 for plain output.")}
`);
}

function ensureFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    log.error(`missing file: ${file}`);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    log.error(`missing directory: ${dir}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio || "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    log.error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout || "";
}

function requestUrl(url, { json = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": `${APP_INFO.name}/${APP_INFO.version}`,
          Accept: json ? "application/vnd.github+json" : "*/*",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          requestUrl(next, { json }).then(resolve, reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`request failed (${res.statusCode}) for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          if (!json) {
            resolve(body);
            return;
          }
          try {
            resolve(JSON.parse(body.toString("utf8")));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error(`request timed out for ${url}`));
    });
  });
}

async function updateAnvilAgent() {
  const releaseUrl = `https://api.github.com/repos/${AGENT_INFO.owner}/${AGENT_INFO.repo}/releases/latest`;
  log.step("agent", "checking latest GitHub release");
  const release = await requestUrl(releaseUrl, { json: true });
  const asset = (release.assets || []).find((item) => /\.jar$/i.test(item.name || ""));
  if (!asset) log.error(`no jar asset found on ${release.html_url || releaseUrl}`);

  const dir = anvilAgentDir();
  fs.mkdirSync(dir, { recursive: true });
  const data = await requestUrl(asset.browser_download_url);
  const jarPath = path.join(dir, asset.name);
  const stablePath = path.join(dir, "anvil-agent-latest.jar");
  fs.writeFileSync(jarPath, data);
  fs.copyFileSync(jarPath, stablePath);
  log.step("agent", `saved ${style.dim(jarPath)}`);
  log.step("agent", `updated ${style.dim(stablePath)}`);
  return stablePath;
}

function readProperties(file) {
  if (!fs.existsSync(file)) return {};
  const props = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return props;
}

function writeProperties(file, props) {
  const lines = [
    "#AnvilAgent configuration",
    `#${new Date().toString()}`,
  ];
  const cleanProps = {
    unblockMods: props.unblockMods === "true" ? "true" : "false",
    unlockCosmetics: props.unlockCosmetics === "true" ? "true" : "false",
  };
  for (const key of Object.keys(cleanProps).sort()) {
    lines.push(`${key}=${cleanProps[key]}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
}

async function configureAgent() {
  const configPath = path.join(anvilAgentDir(), AGENT_INFO.configName);
  const props = readProperties(configPath);
  if (props.unblockMods !== "true" && props.unblockMods !== "false") props.unblockMods = "false";
  if (props.unlockCosmetics !== "true" && props.unlockCosmetics !== "false") props.unlockCosmetics = "false";

  console.log(`${banner()}\n`);
  log.step("config", configPath);
  console.log(`\n  ${style.magenta("[1]")}  unblockMods: ${props.unblockMods === "true" ? style.green("true") : style.dim("false")}`);
  console.log(`  ${style.magenta("[2]")}  unlockCosmetics: ${props.unlockCosmetics === "true" ? style.green("true") : style.dim("false")}`);
  console.log(`  ${style.dim("[q]")}  Back\n`);
  const answer = await ask(`${style.magenta("❯")} Select option: `);
  if (answer === "1") {
    props.unblockMods = props.unblockMods === "true" ? "false" : "true";
    writeProperties(configPath, props);
    log.success(`Saved unblockMods=${props.unblockMods}`);
    return configureAgent();
  }
  if (answer === "2") {
    props.unlockCosmetics = props.unlockCosmetics === "true" ? "false" : "true";
    writeProperties(configPath, props);
    log.success(`Saved unlockCosmetics=${props.unlockCosmetics}`);
    return configureAgent();
  }
  if (answer.toLowerCase() === "q" || answer === "") return;
  log.error(`invalid option: ${answer}`);
}

function backup(file) {
  ensureFile(file);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, target);
  log.step("backup", target);
}

function backupIfExists(file) {
  if (!fs.existsSync(file)) return false;
  backup(file);
  return true;
}

function latestBackup(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  if (!fs.existsSync(dir)) return undefined;
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${base}.bak-`))
    .map((name) => path.join(dir, name))
    .filter((candidate) => fs.statSync(candidate).isFile())
    .sort()
    .at(-1);
}

function restoreBackup(file, required = true) {
  const backupFile = latestBackup(file);
  if (!backupFile) {
    if (required) log.error(`no backup found for ${file}`);
    log.step("restore", style.dim(`no backup found for ${path.basename(file)}`));
    return false;
  }
  fs.copyFileSync(backupFile, file);
  log.step("restore", `${style.dim(path.basename(file))} ← ${path.basename(backupFile)}`);
  return true;
}

function readAsarHeader(file) {
  const fd = fs.openSync(file, "r");
  try {
    const sizeBuf = Buffer.alloc(16);
    fs.readSync(fd, sizeBuf, 0, 16, 0);
    const headerSizeFieldSize = sizeBuf.readUInt32LE(0);
    const headerSize = sizeBuf.readUInt32LE(4);
    const headerPayloadSize = sizeBuf.readUInt32LE(8);
    const headerStringSize = sizeBuf.readUInt32LE(12);
    if (headerSizeFieldSize !== 4 || headerPayloadSize > headerSize || headerStringSize > headerPayloadSize) {
      log.error("unsupported ASAR header format");
    }
    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 8);
    const headerString = headerBuf.subarray(8, 8 + headerStringSize).toString("utf8").replace(/\0+$/g, "");
    return {
      header: JSON.parse(headerString),
      headerBuf,
      headerSize,
      headerStringSize,
      headerString,
      payloadStart: 8 + headerSize,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function writeAsarHeaderInPlace(file, meta) {
  const headerString = JSON.stringify(meta.header);
  const headerBytes = Buffer.from(headerString, "utf8");
  if (headerBytes.length !== meta.headerStringSize) {
    log.error("updated ASAR header size changed; cannot write safely in place");
  }
  const fd = fs.openSync(file, "r+");
  try {
    fs.writeSync(fd, headerBytes, 0, headerBytes.length, 16);
  } finally {
    fs.closeSync(fd);
  }
  meta.headerString = headerString;
  meta.headerBuf = Buffer.from(meta.headerBuf);
  headerBytes.copy(meta.headerBuf, 8);
}

function entryFor(header, relativePath) {
  let node = header.files;
  for (const part of relativePath.split("/")) {
    node = node && node[part];
    if (!node) return undefined;
    if (node.files && part !== relativePath.split("/").at(-1)) node = node.files;
  }
  return node;
}

function walkFiles(header, rootPath) {
  const root = entryFor(header, rootPath);
  if (!root || !root.files) log.error(`missing ASAR directory: ${rootPath}`);
  const out = [];
  function walk(node, prefix) {
    for (const [name, child] of Object.entries(node.files || {})) {
      const childPath = `${prefix}/${name}`;
      if (child.files) walk(child, childPath);
      else out.push(childPath);
    }
  }
  walk(root, rootPath);
  return out;
}

function walkAllAsarFiles(header) {
  const out = [];
  function walk(node, prefix) {
    for (const [name, child] of Object.entries(node.files || {})) {
      const childPath = prefix ? `${prefix}/${name}` : name;
      if (child.files) walk(child, childPath);
      else out.push(childPath);
    }
  }
  walk({ files: header.files }, "");
  return out;
}

function readAsarFile(asar, meta, relativePath) {
  const entry = entryFor(meta.header, relativePath);
  if (!entry || entry.files) log.error(`missing ASAR file: ${relativePath}`);
  const offset = meta.payloadStart + Number(entry.offset);
  const size = Number(entry.size);
  const fd = fs.openSync(asar, "r");
  try {
    const data = Buffer.alloc(size);
    fs.readSync(fd, data, 0, size, offset);
    return data;
  } finally {
    fs.closeSync(fd);
  }
}

function updateAsarFileIntegrity(asar, meta, relativePath) {
  const entry = entryFor(meta.header, relativePath);
  if (!entry || entry.files) log.error(`missing ASAR file: ${relativePath}`);
  const data = readAsarFile(asar, meta, relativePath);
  const blockSize = Number(entry.integrity?.blockSize || 4194304);
  const blocks = [];
  for (let offset = 0; offset < data.length; offset += blockSize) {
    blocks.push(crypto.createHash("sha256").update(data.subarray(offset, offset + blockSize)).digest("hex"));
  }
  entry.integrity = {
    algorithm: "SHA256",
    hash: crypto.createHash("sha256").update(data).digest("hex"),
    blockSize,
    blocks,
  };
}

function writeAsarFileInPlace(asar, meta, relativePath, data) {
  const entry = entryFor(meta.header, relativePath);
  if (!entry || entry.files) log.error(`missing ASAR file: ${relativePath}`);
  const size = Number(entry.size);
  let bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
  if (bytes.length > size) {
    log.error(`${relativePath} patch is ${bytes.length - size} bytes too large for in-place ASAR slot`);
  }
  if (bytes.length < size) bytes = Buffer.concat([bytes, Buffer.alloc(size - bytes.length, 0x20)]);
  const fd = fs.openSync(asar, "r+");
  try {
    fs.writeSync(fd, bytes, 0, bytes.length, meta.payloadStart + Number(entry.offset));
  } finally {
    fs.closeSync(fd);
  }
}

function updateAsarSignature(sigPath, fromMeta, toMeta) {
  if (!fs.existsSync(sigPath)) return false;
  const replacements = [
    [
      crypto.createHash("sha256").update(fromMeta.headerString).digest(),
      crypto.createHash("sha256").update(toMeta.headerString).digest(),
    ],
    [
      Buffer.from(crypto.createHash("sha256").update(fromMeta.headerString).digest("hex"), "utf8"),
      Buffer.from(crypto.createHash("sha256").update(toMeta.headerString).digest("hex"), "utf8"),
    ],
  ];
  if (fromMeta.headerBuf && toMeta.headerBuf) {
    replacements.push(
      [
        crypto.createHash("sha256").update(fromMeta.headerBuf).digest(),
        crypto.createHash("sha256").update(toMeta.headerBuf).digest(),
      ],
      [
        Buffer.from(crypto.createHash("sha256").update(fromMeta.headerBuf).digest("hex"), "utf8"),
        Buffer.from(crypto.createHash("sha256").update(toMeta.headerBuf).digest("hex"), "utf8"),
      ]
    );
  }
  const sig = fs.readFileSync(sigPath);
  let count = 0;
  for (const [fromHash, toHash] of replacements) {
    for (let offset = sig.indexOf(fromHash); offset >= 0; offset = sig.indexOf(fromHash, offset + toHash.length)) {
      toHash.copy(sig, offset);
      count++;
    }
  }
  if (count === 0) log.error("could not find ASAR header hash in app.asar.sig");
  fs.writeFileSync(sigPath, sig);
  log.step("asar", `updated app.asar.sig (${count} replacement(s))`);
  return true;
}

function restoreDisabledFile(file) {
  const disabled = `${file}.disabled`;
  if (fs.existsSync(file) || !fs.existsSync(disabled)) return false;
  fs.renameSync(disabled, file);
  log.step("restore", `${path.basename(file)} ← ${path.basename(disabled)}`);
  return true;
}

function disableFile(file) {
  if (!fs.existsSync(file)) return false;
  const disabled = `${file}.disabled`;
  if (fs.existsSync(disabled)) fs.rmSync(disabled, { force: true });
  fs.renameSync(file, disabled);
  log.step("disable", path.basename(file));
  return true;
}

function restoreDisabledFiles(files) {
  let restored = false;
  for (const file of files) {
    if (restoreDisabledFile(file)) restored = true;
  }
  return restored;
}

function copyAsarDir(asar, meta, sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  for (const file of walkFiles(meta.header, sourceDir)) {
    const rel = path.relative(sourceDir, file);
    const out = path.join(targetDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, readAsarFile(asar, meta, file));
  }
}

class Patcher {
  constructor(appPath) {
    this.appPath = appPath;
    const layout = this.resolveLayout(appPath);
    this.contentsPath = layout.contentsPath;
    this.resourcesPath = layout.resourcesPath;
    this.asarPath = path.join(this.resourcesPath, "app.asar");
    this.sigPath = path.join(this.resourcesPath, "app.asar.sig");
    this.infoPlistPath = path.join(this.contentsPath, "Info.plist");
    this.verifierBinaryPath = this.resolveVerifierBinaryPath();
    this.unpackedAppPath = path.join(this.resourcesPath, "app");
    this.patchedDistPath = path.join(this.resourcesPath, "dist-patched");
  }

  resolveLayout(appPath) {
    if (process.platform === "darwin" || appPath.endsWith(".app")) {
      const contentsPath = path.join(appPath, "Contents");
      return { contentsPath, resourcesPath: path.join(contentsPath, "Resources") };
    }

    let baseDir = appPath;
    if (path.extname(appPath).toLowerCase() === ".exe") {
      baseDir = path.dirname(appPath);
    } else if (fs.existsSync(appPath) && fs.statSync(appPath).isFile()) {
      baseDir = path.dirname(appPath);
    }

    if (path.basename(baseDir).toLowerCase() === "resources") {
      return { contentsPath: path.dirname(baseDir), resourcesPath: baseDir };
    }

    return { contentsPath: baseDir, resourcesPath: path.join(baseDir, "resources") };
  }

  resolveVerifierBinaryPath() {
    if (process.platform === "darwin") {
      return path.join(this.contentsPath, "Frameworks", "Electron Framework.framework", "Versions", "A", "Electron Framework");
    }
    if (process.platform !== "win32") return "";
    if (path.extname(this.appPath).toLowerCase() === ".exe") return this.appPath;
    const exePath = path.join(this.contentsPath, "Feather Launcher.exe");
    return fs.existsSync(exePath) ? exePath : "";
  }

  validate() {
    if (process.platform === "win32" && !fs.existsSync(this.resourcesPath)) {
      for (const candidate of windowsLauncherCandidates(this.appPath)) {
        const layout = this.resolveLayout(candidate);
        if (fs.existsSync(layout.resourcesPath)) {
          this.appPath = candidate;
          this.contentsPath = layout.contentsPath;
          this.resourcesPath = layout.resourcesPath;
          this.asarPath = path.join(this.resourcesPath, "app.asar");
          this.sigPath = path.join(this.resourcesPath, "app.asar.sig");
          this.unpackedAppPath = path.join(this.resourcesPath, "app");
          this.patchedDistPath = path.join(this.resourcesPath, "dist-patched");
          this.verifierBinaryPath = this.resolveVerifierBinaryPath();
          break;
        }
      }
    }
    ensureDir(this.resourcesPath);
    ensureFile(this.asarPath);
  }

  patchRendererFile(file) {
    if (!fs.existsSync(file)) return false;
    let s = fs.readFileSync(file, "utf8");
    const original = s;
    s = s.replaceAll("ads=!0;constructor", "ads=!1;constructor");
    s = s.replaceAll("this.ads=o,this.changeDetectorRef.markForCheck()", "this.ads=!1,this.changeDetectorRef.markForCheck()");
    if (s !== original) fs.writeFileSync(file, s);
    return s !== original;
  }

  patchMainBundle(meta) {
    const data = readAsarFile(this.asarPath, meta, PATH_SELECTORS.mainBundle);
    let s = data.toString("utf8");
    const originalLength = s.length;
    let patched = false;

    const rPat = /async startLauncherProdApp\(\)\{try\{await this\.browserWindowManager\.window\.loadFile\(`dist\/\$\{this\.windowSlug\}\/index\.html`\)[\s\S]*?\}\}/;
    const rRep = "async startLauncherProdApp(){const p=require('path'),u=require('url'),f=require('fs'),d=p.join(require('electron').app.getPath('appData'),'feather'),j=p.join(d,'app-settings.json');f.mkdirSync(d,{recursive:!0});if(!f.existsSync(j))f.writeFileSync(j,'{}');await this.browserWindowManager.window.loadURL(u.pathToFileURL(p.join(process.resourcesPath,'dist-patched',this.windowSlug,'index.html')).toString())}";

    if (rPat.test(s)) {
      s = s.replace(rPat, rRep);
      patched = true;
    }
    const oldFileUrlRep = "async startLauncherProdApp(){await this.browserWindowManager.window.loadURL('file://'+require('path').join(process.resourcesPath,'dist-patched',this.windowSlug,'index.html'))}";
    if (s.includes(oldFileUrlRep)) {
      s = s.replaceAll(oldFileUrlRep, rRep);
      patched = true;
    }

    if (!s.includes("anvil-get-config")) {
      const inj = `;(()=>{const p=require("path"),f=require("fs"),h=require("os").homedir(),c=p.join(h,".anvil-agent","config.properties"),i=require("electron").ipcMain;i.handle("anvil-get-config",()=>{let r={};try{f.readFileSync(c,"utf8").split("\\n").map(l=>{let[k,v]=l.split("=");if(k)r[k.trim()]=v.trim()})}catch(e){}return r});i.on("anvil-set-config",(e,r)=>{let s="";for(let k in r)s+=k+"="+r[k]+"\\n";try{f.mkdirSync(p.dirname(c),{recursive:!0});f.writeFileSync(c,s)}catch(e){}})})();`;
      const anchor = 'await Dr.whenReady()';
      if (s.includes(anchor)) {
        s = s.replace(anchor, inj + anchor);
        patched = true;
      }
    }

    if (!s.includes("__ELECTRON_ASAR_VERIFIED__")) {
      const verificationDisable = `;global.__ELECTRON_ASAR_VERIFIED__=1`;
      const anchor = 'await Dr.whenReady()';
      if (s.includes(anchor)) {
        s = s.replace(anchor, verificationDisable + anchor);
        patched = true;
      }
    }

    const replacements = [
      ["pee||this.browserWindowManager.createAdWebviewManager()", "0"],
      ["adConfigShareHandler(r){this.launcherWindowManager.adUrls=r.domains||[]}", "adConfigShareHandler(r){}"],
      ["adConfigShareHandler(r){this.cacheManager.cache.adConfigManager.setConfig(r),this.sendAdConfigToRenderer(),this.browserWindowManager.adUrls=r.domains||[]}", "adConfigShareHandler(r){}"],
      ["createAdWebviewManager(){hee(this.window,this.screen,()=>this.adUrls)}", "createAdWebviewManager(){}"],
      ["LauncherWindowBase->startLauncherProdApp: ${r.message}", "${r.message}"],
      ["ASAR Integrity Violation: got a hash mismatch (${s} vs ${e.hash})", "ASAR Error"],
    ];

    for (const [from, to] of replacements) {
      if (s.includes(from)) {
        s = s.replaceAll(from, to);
        patched = true;
      }
    }

    if (patched) {
      s = s.replace(/\/\*![\s\S]*?\*\//g, "");
      s = s.replace(/\s+$/, "");
      if (s.length > originalLength) log.error(`main.bundle.js patch is ${s.length - originalLength} bytes too large`);
      writeAsarFileInPlace(this.asarPath, meta, PATH_SELECTORS.mainBundle, s);
    }
    return patched;
  }

  patchMainBundleFile(file) {
    ensureFile(file);
    let s = fs.readFileSync(file, "utf8");
    let patched = false;

    const rPat = /async startLauncherProdApp\(\)\{try\{await this\.browserWindowManager\.window\.loadFile\(`dist\/\$\{this\.windowSlug\}\/index\.html`\)[\s\S]*?\}\}/;
    const rRep = "async startLauncherProdApp(){const p=require('path'),u=require('url'),f=require('fs'),d=p.join(require('electron').app.getPath('appData'),'feather'),j=p.join(d,'app-settings.json');f.mkdirSync(d,{recursive:!0});if(!f.existsSync(j))f.writeFileSync(j,'{}');await this.browserWindowManager.window.loadURL(u.pathToFileURL(p.join(process.resourcesPath,'dist-patched',this.windowSlug,'index.html')).toString())}";
    
    if (rPat.test(s)) {
      s = s.replace(rPat, rRep);
      patched = true;
    }
    const oldFileUrlRep = "async startLauncherProdApp(){await this.browserWindowManager.window.loadURL('file://'+require('path').join(process.resourcesPath,'dist-patched',this.windowSlug,'index.html'))}";
    if (s.includes(oldFileUrlRep)) {
      s = s.replaceAll(oldFileUrlRep, rRep);
      patched = true;
    }

    if (!s.includes("anvil-get-config")) {
      const inj = `;(()=>{const p=require("path"),f=require("fs"),h=require("os").homedir(),c=p.join(h,".anvil-agent","config.properties"),i=require("electron").ipcMain;i.handle("anvil-get-config",()=>{let r={};try{f.readFileSync(c,"utf8").split("\\n").map(l=>{let[k,v]=l.split("=");if(k)r[k.trim()]=v.trim()})}catch(e){}return r});i.on("anvil-set-config",(e,r)=>{let s="";for(let k in r)s+=k+"="+r[k]+"\\n";try{f.mkdirSync(p.dirname(c),{recursive:!0});f.writeFileSync(c,s)}catch(e){}})})();`;
      const anchor = 'await Dr.whenReady()';
      if (s.includes(anchor)) {
        s = s.replace(anchor, inj + anchor);
        patched = true;
      }
    }

    const replacements = [
      ["pee||this.browserWindowManager.createAdWebviewManager()", "0"],
      ["adConfigShareHandler(r){this.launcherWindowManager.adUrls=r.domains||[]}", "adConfigShareHandler(r){}"],
      ["adConfigShareHandler(r){this.cacheManager.cache.adConfigManager.setConfig(r),this.sendAdConfigToRenderer(),this.browserWindowManager.adUrls=r.domains||[]}", "adConfigShareHandler(r){}"],
      ["createAdWebviewManager(){hee(this.window,this.screen,()=>this.adUrls)}", "createAdWebviewManager(){}"],
      ["LauncherWindowBase->startLauncherProdApp: ${r.message}", "${r.message}"],
      ["ASAR Integrity Violation: got a hash mismatch (${s} vs ${e.hash})", "ASAR Error"],
    ];

    for (const [from, to] of replacements) {
      if (s.includes(from)) {
        s = s.replaceAll(from, to);
        patched = true;
      }
    }

    if (patched) fs.writeFileSync(file, s);
    return patched;
  }

  patchElectronIntegrityExit() {
    if (process.platform !== "darwin" || !fs.existsSync(this.verifierBinaryPath)) return false;
    let b = fs.readFileSync(this.verifierBinaryPath);
    const needle = Buffer.from('console.error(`ASAR Integrity Violation: got a hash mismatch (${s} vs ${e.hash})`),process.exit(1)');
    const offset = b.indexOf(needle);
    if (offset < 0) return false;
    backup(this.verifierBinaryPath);
    Buffer.from("0".padEnd(needle.length, " ")).copy(b, offset);
    fs.writeFileSync(this.verifierBinaryPath, b);
    log.step("framework", "patched ASAR integrity exit guard");
    return true;
  }

  patchElectronFuses() {
    if (!fs.existsSync(this.verifierBinaryPath)) {
      log.warn("Electron verifier binary not found; ASAR integrity may still be enabled");
      return false;
    }
    const sentinel = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");
    const b = fs.readFileSync(this.verifierBinaryPath);
    const offsets = [];
    for (let offset = b.indexOf(sentinel); offset >= 0; offset = b.indexOf(sentinel, offset + sentinel.length)) {
      offsets.push(offset);
    }
    if (offsets.length === 0) {
      log.warn(`Electron fuse sentinel not found in ${this.verifierBinaryPath}`);
      return false;
    }

    let changed = 0;
    let recognized = 0;
    const fuseIndexes = process.platform === "win32" ? [4, 5] : [4];
    let allRequiredDisabled = false;
    for (const offset of offsets) {
      const vOffset = offset + sentinel.length;
      const fuseLength = b[vOffset + 1];
      if (b[vOffset] !== 1 || fuseLength <= Math.max(...fuseIndexes)) continue;
      recognized++;
      for (const fuseIndex of fuseIndexes) {
        const fuseOffset = vOffset + 2 + fuseIndex;
        // Flip fuse byte: invert the bit to disable verification
        b[fuseOffset] = b[fuseOffset] ^ 0x01;
        changed++;
      }
      if (fuseIndexes.every((fuseIndex) => b[vOffset + 2 + fuseIndex] !== 0x30)) allRequiredDisabled = true;
    }

    if (recognized === 0) {
      log.warn("Electron fuse layout was not recognized");
      return false;
    }
    if (!allRequiredDisabled) {
      log.warn("Electron ASAR fuses could not be verified as disabled");
      return false;
    }
    if (changed === 0) {
      log.step("fuses", `required ASAR fuses already disabled (${recognized} fuse block(s))`);
      return true;
    }
    backup(this.verifierBinaryPath);
    fs.writeFileSync(this.verifierBinaryPath, b);
    log.step("fuses", `disabled required ASAR fuses (${changed} edit(s), ${recognized} fuse block(s))`);
    return true;
  }

  patchOfficialAppVerifierWindows() {
    if (process.platform !== "win32" || !fs.existsSync(this.verifierBinaryPath)) return false;
    let b = fs.readFileSync(this.verifierBinaryPath);

    const s1 = Buffer.from("Signature verification failed", "utf8");
    const p1 = b.indexOf(s1);
    if (p1 < 0) {
      log.warn("Could not find signature error string in binary.");
      return false;
    }

    let patchCount = 0;

    // Anchor: Line number 147 (0x93)
    const linePattern = Buffer.from([0xBA, 0x93, 0x00, 0x00, 0x00]);
    let anchorPos = b.indexOf(linePattern);

    if (anchorPos < 0 || Math.abs(anchorPos - p1) > 4096) {
      for (let i = p1; i > p1 - 1024 && i > 0; i--) {
        if (b[i] === 0x93 && (b[i-1] === 0xBA || b[i-1] === 0xBE || b[i-1] === 0xBF)) {
          anchorPos = i - 1;
          break;
        }
      }
    }

    if (anchorPos >= 0) {
      log.step("verifier", `found error block anchor at 0x${anchorPos.toString(16)} (line 147)`);

      // NOP all instances of the fatal block - skip string replacement which corrupts binary
      let searchPos = 0;
      while (true) {
        const pos = b.indexOf(linePattern, searchPos);
        if (pos < 0) break;

        if (patchCount === 0) backup(this.verifierBinaryPath);
        for (let k = 0; k < 10; k++) {
          if (pos + k < b.length) b[pos + k] = 0x90;
        }
        log.step("verifier", `noped fatal block at 0x${pos.toString(16)}`);
        patchCount++;
        searchPos = pos + 10;
      }

      // Global branch flipping
      const targetMin = anchorPos - 20;
      const targetMax = anchorPos + 20;

      for (let j = 0; j < b.length - 6; j++) {
        let jumpTarget = -1;
        let isLong = false;

        if (b[j] === 0x74 || b[j] === 0x75) {
          jumpTarget = j + 2 + b.readInt8(j+1);
        } else if (b[j] === 0x0F && (b[j+1] === 0x84 || b[j+1] === 0x85)) {
          jumpTarget = j + 6 + b.readInt32LE(j+2);
          isLong = true;
        }

        if (jumpTarget >= targetMin && jumpTarget <= targetMax) {
          if (patchCount === 0) backup(this.verifierBinaryPath);
          if (!isLong) {
            b[j] = b[j] === 0x74 ? 0x90 : 0xEB; // JZ -> NOP, JNZ -> JMP
            if (b[j] === 0x90) b[j+1] = 0x90;
            log.step("verifier", `flipped branch at 0x${j.toString(16)}`);
          } else {
            if (b[j+1] === 0x84) for (let k = 0; k < 6; k++) b[j+k] = 0x90;
            else { b[j] = 0xE9; b[j+5] = 0x90; }
            log.step("verifier", `flipped long branch at 0x${j.toString(16)}`);
          }
          patchCount++;
        }
      }
    }

    if (anchorPos >= 0) {
      const dumpSize = 128;
      const start = Math.max(0, anchorPos - 64);
      const hex = b.subarray(start, start + dumpSize).toString("hex").match(/.{1,2}/g).join(" ");
      log.info(`Debug Dump (0x${start.toString(16)}): ${hex}`);
    }

    if (patchCount > 0) {
      fs.writeFileSync(this.verifierBinaryPath, b);
      return true;
    }

    log.warn("Could not find the branching logic for signature verification.");
    return false;
  }

  patchOfficialAppVerifier() {
    if (process.platform !== "darwin" || !fs.existsSync(this.verifierBinaryPath)) return false;
    const b = fs.readFileSync(this.verifierBinaryPath);
    const ret = 0xd65f03c0, vEntry = 0x2aa7c3c, pOff = 0x2aa7990, hPrologue = 0xa9bd57f6;
    const fatalS = 0x52800063, infoS = 0x52800003;
    const directEdits = [];
    if (b.readUInt32LE(pOff) === ret) directEdits.push([pOff, hPrologue]);
    if (b.readUInt32LE(vEntry) !== ret) directEdits.push([vEntry, ret]);
    backup(this.verifierBinaryPath);
    for (const [off, inst] of directEdits) b.writeUInt32LE(inst, off);
    fs.writeFileSync(this.verifierBinaryPath, b);
    log.step("verifier", `disabled official app signature check(s)`);
    return true;
  }

  removePlistAsarIntegrity() {
    if (process.platform !== "darwin" || !fs.existsSync(this.infoPlistPath)) return;
    const pBuddy = "/usr/libexec/PlistBuddy";
    if (!fs.existsSync(pBuddy)) return;
    const probe = spawnSync(pBuddy, ["-c", "Print :ElectronAsarIntegrity", this.infoPlistPath], { stdio: "ignore" });
    if (probe.status === 0) {
      run(pBuddy, ["-c", "Delete :ElectronAsarIntegrity", this.infoPlistPath]);
      log.step("plist", "removed ElectronAsarIntegrity");
    }
  }

  sign() {
    if (process.platform !== "darwin") return;
    run("codesign", ["--force", "--deep", "--sign", "-", this.appPath], { stdio: "inherit" });
    log.step("codesign", "re-signed application");
  }

  patchRendererGUI(file) {
    if (!file.includes("launcher" + path.sep + "main.")) return false;
    let s = fs.readFileSync(file, "utf8");
    if (s.includes('id="anvil-ui-root"')) return false;

    const uiCode = `
;(() => {
  try {
    const ROOT_ID = 'anvil-ui-root';
    const routeMatch = () => location.href.includes('/anvil') || location.hash.includes('/anvil');

    const css = \`
      #\${ROOT_ID} {
        position: fixed; inset: 0; z-index: 999999;
        display: none; align-items: stretch; justify-content: stretch;
        background: #08090f;
        font-family: Inter, "Segoe UI", system-ui, sans-serif; color: #f8f8fb;
        animation: anvilFadeIn 180ms ease-out;
      }
      @keyframes anvilFadeIn { from { opacity: 0; } to { opacity: 1; } }
      .anvil-shell {
        width: 100%; height: 100%; display: grid; grid-template-columns: 86px minmax(180px, 248px) 1fr;
        overflow: hidden; background: #0b0d14;
      }
      .anvil-rail { background: #07080d; border-right: 1px solid rgba(255,255,255,.06); padding: 22px 13px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
      .anvil-mark { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg,#ff2e8c,#ff5b38); display: grid; place-items: center; font-weight: 900; font-size: 22px; box-shadow: 0 12px 28px rgba(255,46,140,.28); }
      .anvil-rail-btn { width: 48px; height: 48px; border: 0; border-radius: 14px; color: #787b88; background: transparent; display: grid; place-items: center; cursor: pointer; font-size: 18px; }
      .anvil-rail-btn.active { color: #fff; background: #151822; }
      .anvil-nav { background: #0b0d14; border-right: 1px solid rgba(255,255,255,.06); padding: 28px 18px; display: flex; flex-direction: column; gap: 10px; }
      .anvil-brand { color: #fff; font-size: 20px; font-weight: 800; margin: 2px 6px 18px; }
      .anvil-side-item { border: 0; border-radius: 8px; background: transparent; color: #8a8d98; text-align: left; padding: 12px 14px; cursor: pointer; font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 11px; transition: 0.15s; }
      .anvil-side-item.active { color: #fff; background: #181b25; box-shadow: inset 3px 0 0 #ff2e8c; }
      .anvil-side-item.muted { color: #585c68; }
      .anvil-main { display: flex; flex-direction: column; min-width: 0; background: #10131c; }
      .anvil-topbar { height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; border-bottom: 1px solid rgba(255,255,255,.06); background: #0f121b; }
      .anvil-search { height: 38px; width: min(360px, 46vw); border-radius: 8px; background: #191d29; color: #8e93a2; display: flex; align-items: center; gap: 10px; padding: 0 14px; font-size: 13px; }
      .anvil-close { width: 34px; height: 34px; border-radius: 8px; border: 0; background: #191d29; color: #8c909d; cursor: pointer; transition: 0.15s; }
      .anvil-close:hover { background: #242938; color: #fff; }
      .anvil-content { padding: 34px 42px 46px; overflow-y: auto; flex: 1; }
      .anvil-title { font-size: 30px; line-height: 1.15; font-weight: 850; margin: 0 0 8px; }
      .anvil-subtitle { color: #8a8f9f; font-size: 14px; margin: 0 0 30px; }
      .anvil-section-title { font-size: 12px; font-weight: 850; color: #9ba0af; text-transform: uppercase; margin: 28px 0 12px; }
      .anvil-card { max-width: 760px; border: 1px solid rgba(255,255,255,.07); border-radius: 8px; background: #151923; overflow: hidden; }
      .anvil-tile { min-height: 76px; padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; gap: 18px; border-bottom: 1px solid rgba(255,255,255,.06); }
      .anvil-tile:last-child { border-bottom: 0; }
      .anvil-tile-title { font-weight: 750; font-size: 15px; color: #f7f7fb; }
      .anvil-tile-copy { color: #7f8492; font-size: 13px; margin-top: 4px; }
      .anvil-switch { position: relative; width: 46px; height: 26px; flex: 0 0 auto; }
      .anvil-switch input { opacity: 0; width: 0; height: 0; }
      .anvil-slider { position: absolute; inset: 0; border-radius: 999px; background: #2a2f3e; transition: 0.2s; cursor: pointer; }
      .anvil-slider:before { content: ""; position: absolute; left: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #d8dbe5; transition: 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
      input:checked + .anvil-slider { background: #ff2e8c; box-shadow: 0 0 0 3px rgba(255,46,140,.16); }
      input:checked + .anvil-slider:before { transform: translateX(20px); background: #fff; }
      @media (max-width: 760px) {
        .anvil-shell { grid-template-columns: 68px 1fr; }
        .anvil-nav { display: none; }
        .anvil-content { padding: 26px 20px 36px; }
        .anvil-search { width: 48vw; }
      }
    \`;

    const mount = () => {
      if (document.getElementById(ROOT_ID)) return;
      const root = document.createElement('div');
      root.id = ROOT_ID;
      root.innerHTML = \`
        <style>\${css}</style>
        <div class="anvil-shell" onclick="event.stopPropagation()">
          <aside class="anvil-rail">
            <div class="anvil-mark">F</div>
            <button class="anvil-rail-btn">⌂</button>
            <button class="anvil-rail-btn active">⚙</button>
            <button class="anvil-rail-btn">☰</button>
          </aside>
          <nav class="anvil-nav">
            <div class="anvil-brand">Feather</div>
            <button class="anvil-side-item muted">General</button>
            <button class="anvil-side-item active">Anvil Agent</button>
            <button class="anvil-side-item muted">Launcher</button>
            <button class="anvil-side-item muted">Minecraft</button>
            <button class="anvil-side-item muted">Accounts</button>
          </nav>
          <main class="anvil-main">
            <div class="anvil-topbar">
              <div class="anvil-search">⌕ Search settings</div>
              <button class="anvil-close">✕</button>
            </div>
            <div class="anvil-content">
              <h1 class="anvil-title">Anvil Agent</h1>
              <p class="anvil-subtitle">Manage local agent options used when Feather launches Minecraft.</p>
              <div class="anvil-section-title">Game options</div>
              <div class="anvil-card">
                <div class="anvil-tile">
                  <div><div class="anvil-tile-title">Unblock Mods</div><div class="anvil-tile-copy">Allow the local agent to load normally blocked mods.</div></div>
                  <label class="anvil-switch"><input type="checkbox" id="anvil-opt-mods"><span class="anvil-slider"></span></label>
                </div>
                <div class="anvil-tile">
                  <div><div class="anvil-tile-title">Unlock Cosmetics</div><div class="anvil-tile-copy">Expose local cosmetic and emote access through the agent.</div></div>
                  <label class="anvil-switch"><input type="checkbox" id="anvil-opt-cosmetics"><span class="anvil-slider"></span></label>
                </div>
              </div>
            </div>
          </main>
        </div>
      \`;
      document.body.appendChild(root);
      root.onclick = () => { location.hash = '#/'; };
      root.querySelector('.anvil-close').onclick = () => { location.hash = '#/'; };

      const { ipcRenderer } = require('electron');
      const sync = async () => {
        const cfg = await ipcRenderer.invoke('anvil-get-config') || {};
        const cb1 = document.getElementById('anvil-opt-mods');
        const cb2 = document.getElementById('anvil-opt-cosmetics');
        if (cb1) {
          cb1.checked = cfg.unblockMods === 'true';
          cb1.onchange = () => { cfg.unblockMods = cb1.checked ? 'true' : 'false'; ipcRenderer.send('anvil-set-config', cfg); };
        }
        if (cb2) {
          cb2.checked = cfg.unlockCosmetics === 'true';
          cb2.onchange = () => { cfg.unlockCosmetics = cb2.checked ? 'true' : 'false'; ipcRenderer.send('anvil-set-config', cfg); };
        }
      };
      sync().catch(()=>{});
    };

    const route = () => {
      const el = document.getElementById(ROOT_ID);
      if (routeMatch()) { if (!el) mount(); else el.style.display = 'flex'; }
      else if (el) el.style.display = 'none';
    };

    setInterval(route, 150);
  } catch(e) {}
})();
`;
    s = uiCode + s;
    const nItem = '{variableName:"leftMenu.play",faClass:"fa-solid fa-couch",url:"/",forLoggedUser:!1}';
    if (s.includes(nItem) && !s.includes('url:"/anvil"')) {
      s = s.replace(nItem, nItem + ',{variableName:"Anvil",faClass:"fa-solid fa-shield",url:"/anvil",forLoggedUser:!1,label:"Anvil"}');
    }
    const sRoute = s.match(/\{path:"settings",(loadChildren:[^}]+)\}/);
    if (sRoute && !s.includes(',{path:"anvil"')) {
      s = s.replace(sRoute[0], sRoute[0] + `,{path:"anvil",${sRoute[1]}}`);
    }
    fs.writeFileSync(file, s);
    return true;
  }

  patchLaunchFork(meta) {
    const data = readAsarFile(this.asarPath, meta, PATH_SELECTORS.preloadLaunchFork);
    let s = data.toString("utf8");
    const originalLength = s.length;
    let patched = false;
    if (!s.includes("anvil-agent-latest.jar")) {
      const agentPath = "require('path').join(require('os').homedir(),'.anvil-agent','anvil-agent-latest.jar')";
      const needle = /n=\[`-Xmx\$\{e\.ram\}M`,"-XX:\+UnlockExperimentalVMOptions","-XX:\+UseG1GC","-XX:G1NewSizePercent=20","-XX:G1ReservePercent=20","-XX:MaxGCPauseMillis=50",/;
      const replacement = `n=["-javaagent:"+${agentPath},\`-Xmx\${e.ram}M\`,"-XX:+UseG1GC",`;
      if (needle.test(s)) {
        s = s.replace(needle, replacement);
        patched = true;
      }
    }
    if (patched) {
      if (s.length > originalLength) {
        s = s.replace(/\/\*[\s\S]*?\*\//g, "");
        s = s.replace(/\s+$/, "");
      }
      writeAsarFileInPlace(this.asarPath, meta, PATH_SELECTORS.preloadLaunchFork, s);
    }
    return patched;
  }

  patchLaunchForkFile(file) {
    ensureFile(file);
    let s = fs.readFileSync(file, "utf8");
    let patched = false;
    if (!s.includes("anvil-agent-latest.jar")) {
      const agentPath = "require('path').join(require('os').homedir(),'.anvil-agent','anvil-agent-latest.jar')";
      const needle = /n=\[`-Xmx\$\{e\.ram\}M`,"-XX:\+UnlockExperimentalVMOptions","-XX:\+UseG1GC","-XX:G1NewSizePercent=20","-XX:G1ReservePercent=20","-XX:MaxGCPauseMillis=50",/;
      const replacement = `n=["-javaagent:"+${agentPath},\`-Xmx\${e.ram}M\`,"-XX:+UseG1GC",`;
      if (needle.test(s)) {
        s = s.replace(needle, replacement);
        patched = true;
      }
    }
    if (patched) fs.writeFileSync(file, s);
    return patched;
  }

  extractAsarToApp(meta) {
    fs.rmSync(this.unpackedAppPath, { recursive: true, force: true });
    for (const file of walkAllAsarFiles(meta.header)) {
      const out = path.join(this.unpackedAppPath, file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const entry = entryFor(meta.header, file);
      if (entry?.unpacked) {
        const unpackedSource = path.join(`${this.asarPath}.unpacked`, file);
        if (!fs.existsSync(unpackedSource)) log.error(`missing unpacked ASAR file: ${unpackedSource}`);
        fs.copyFileSync(unpackedSource, out);
      } else {
        fs.writeFileSync(out, readAsarFile(this.asarPath, meta, file));
      }
    }
    log.step("unpack", this.unpackedAppPath);
  }

  async runWindowsAsarPatch(meta) {
    log.step("windows", "using ASAR in-place patch mode");
    fs.rmSync(this.patchedDistPath, { recursive: true, force: true });
    for (const dir of PATH_SELECTORS.rendererDirs) {
      const slug = path.basename(dir);
      copyAsarDir(this.asarPath, meta, dir, path.join(this.patchedDistPath, slug));
    }

    let rendererPatched = 0;
    const bundles = [];
    for (const dir of PATH_SELECTORS.rendererDirs) {
      const slug = path.basename(dir);
      const fullDir = path.join(this.patchedDistPath, slug);
      if (!fs.existsSync(fullDir)) continue;
      fs.readdirSync(fullDir).filter(f => f.startsWith("main.") && f.endsWith(".js")).forEach(f => bundles.push(path.join(fullDir, f)));
    }
    for (const file of bundles) {
      if (this.patchRendererFile(file)) rendererPatched++;
      if (this.patchRendererGUI(file)) rendererPatched++;
    }
    log.step("renderer", `patched ${style.bold(rendererPatched)} bundle(s)`);

    for (const file of PATH_SELECTORS.preloadStubs) writeAsarFileInPlace(this.asarPath, meta, file, '"use strict";\n');
    this.patchMainBundle(meta);
    this.patchLaunchFork(meta);
    const oldMeta = {
      headerString: meta.headerString,
      headerBuf: Buffer.from(meta.headerBuf),
    };
    for (const file of [...PATH_SELECTORS.preloadStubs, PATH_SELECTORS.mainBundle, PATH_SELECTORS.preloadLaunchFork]) {
      updateAsarFileIntegrity(this.asarPath, meta, file);
    }
    writeAsarHeaderInPlace(this.asarPath, meta);
    updateAsarSignature(this.sigPath, oldMeta, meta);
    // Binary patching is unreliable across Electron versions - verification is now disabled via JavaScript injection
    // this.patchElectronFuses();
    // this.patchOfficialAppVerifierWindows();
  }

  async runPatch() {
    restoreDisabledFiles([this.asarPath, this.sigPath]);
    this.validate();
    console.log(banner());
    log.info(`Target: ${style.bold(this.appPath)}`);
    try { await updateAnvilAgent(); } catch (err) { log.warn(`Agent update skipped: ${err.message}`); }
    backup(this.asarPath);
    backupIfExists(this.sigPath);
    if (fs.existsSync(this.infoPlistPath)) backup(this.infoPlistPath);
    const meta = readAsarHeader(this.asarPath);
    if (process.platform === "win32") {
      await this.runWindowsAsarPatch(meta);
      log.success("Patching complete!");
      return;
    }
    fs.rmSync(this.patchedDistPath, { recursive: true, force: true });
    for (const dir of PATH_SELECTORS.rendererDirs) {
      const slug = path.basename(dir);
      copyAsarDir(this.asarPath, meta, dir, path.join(this.patchedDistPath, slug));
    }
    let rendererPatched = 0;
    const bundles = [];
    for (const dir of PATH_SELECTORS.rendererDirs) {
      const slug = path.basename(dir);
      const fullDir = path.join(this.patchedDistPath, slug);
      if (!fs.existsSync(fullDir)) continue;
      fs.readdirSync(fullDir).filter(f => f.startsWith("main.") && f.endsWith(".js")).forEach(f => bundles.push(path.join(fullDir, f)));
    }
    for (const file of bundles) {
      if (this.patchRendererFile(file)) rendererPatched++;
      if (this.patchRendererGUI(file)) rendererPatched++;
    }
    log.step("renderer", `patched ${style.bold(rendererPatched)} bundle(s)`);
    for (const file of PATH_SELECTORS.preloadStubs) writeAsarFileInPlace(this.asarPath, meta, file, '"use strict";\n');
    this.patchMainBundle(meta);
    this.patchLaunchFork(meta);
    const oldMeta = {
      headerString: meta.headerString,
      headerBuf: Buffer.from(meta.headerBuf),
    };
    for (const file of [...PATH_SELECTORS.preloadStubs, PATH_SELECTORS.mainBundle, PATH_SELECTORS.preloadLaunchFork]) updateAsarFileIntegrity(this.asarPath, meta, file);
    writeAsarHeaderInPlace(this.asarPath, meta);
    updateAsarSignature(this.sigPath, oldMeta, meta);
    this.removePlistAsarIntegrity();
    this.patchElectronFuses();
    // this.patchOfficialAppVerifier();  // DISABLED: hardcoded offsets don't match this Electron version
    this.patchElectronIntegrityExit();
    this.sign();
    log.success("Patching complete!");
  }

  async runRestore(requireBackups = true) {
    console.log(banner());
    ensureDir(this.resourcesPath);
    restoreDisabledFile(this.asarPath);
    restoreBackup(this.asarPath, requireBackups);
    restoreBackup(this.sigPath, false);
    restoreDisabledFile(this.sigPath);
    if (fs.existsSync(this.infoPlistPath) || latestBackup(this.infoPlistPath)) restoreBackup(this.infoPlistPath, false);
    if (this.verifierBinaryPath && (fs.existsSync(this.verifierBinaryPath) || latestBackup(this.verifierBinaryPath))) restoreBackup(this.verifierBinaryPath, false);
    if (fs.existsSync(this.unpackedAppPath)) fs.rmSync(this.unpackedAppPath, { recursive: true, force: true });
    if (fs.existsSync(this.patchedDistPath)) fs.rmSync(this.patchedDistPath, { recursive: true, force: true });
    this.sign();
    log.success("Restoration complete!");
  }
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => { rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }); });
}

function parseArgs(argv) {
  let target = defaultAppPath();
  let command = "patch";
  let interactive = false;
  if (argv.length === 0 && process.stdin.isTTY) interactive = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") { printHelp(); process.exit(0); }
    if (arg === "-v" || arg === "--version") { console.log(APP_INFO.version); process.exit(0); }
    if (arg === "--app") { target = argv[++i]; continue; }
    if (COMMANDS.has(arg)) { if (arg === "menu") interactive = true; else command = arg; continue; }
    target = arg;
  }
  return { target: path.resolve(target), command, interactive };
}

async function main() {
  const { target, command: initialCommand, interactive } = parseArgs(process.argv.slice(2));
  const patcher = new Patcher(target);
  let command = initialCommand;
  if (interactive) {
    console.clear();
    console.log(menuText());
    const answer = await ask(`${style.magenta("❯")} Select option: `);
    if (answer === "1") command = "patch";
    else if (answer === "2") command = "restore";
    else if (answer === "3") command = "repair";
    else if (answer === "4") command = "agent";
    else if (answer === "5") command = "config";
    else if (answer.toLowerCase() === "q") process.exit(0);
  }
  try {
    if (command === "patch") await patcher.runPatch();
    else if (command === "restore") await patcher.runRestore(true);
    else if (command === "repair") await patcher.runRestore(false);
    else if (command === "agent") await updateAnvilAgent();
    else if (command === "config") await configureAgent();
  } catch (err) { log.error(err.message); }
}

main();
