const fs = require("fs");
const path = require("path");

function readAsarHeader(file) {
  const fd = fs.openSync(file, "r");
  try {
    const sizeBuf = Buffer.alloc(16);
    fs.readSync(fd, sizeBuf, 0, 16, 0);
    const headerSize = sizeBuf.readUInt32LE(4);
    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 8);
    const headerString = headerBuf.subarray(8).toString("utf8").replace(/\0+$/g, "");
    return { header: JSON.parse(headerString), payloadStart: 8 + headerSize };
  } finally {
    fs.closeSync(fd);
  }
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

const asarPath = "/Applications/Feather Launcher.app/Contents/Resources/app.asar";
const meta = readAsarHeader(asarPath);
const entry = entryFor(meta.header, "dist/main.bundle.js");
const fd = fs.openSync(asarPath, "r");
const buf = Buffer.alloc(Number(entry.size));
fs.readSync(fd, buf, 0, buf.length, meta.payloadStart + Number(entry.offset));
fs.writeFileSync("main.bundle.js.extracted", buf);
console.log("Extracted to main.bundle.js.extracted");
fs.closeSync(fd);
