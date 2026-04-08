const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { rcedit } = require("rcedit");

function readPngDimensions(buffer, iconPngPath) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`Invalid PNG file: ${iconPngPath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function createIcoFromPng(iconPngPath, iconIcoPath) {
  const pngBuffer = await fsp.readFile(iconPngPath);
  const { width, height } = readPngDimensions(pngBuffer, iconPngPath);
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);
  iconDir.writeUInt16LE(1, 2);
  iconDir.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(iconDir.length + entry.length, 12);

  await fsp.mkdir(path.dirname(iconIcoPath), { recursive: true });
  await fsp.writeFile(iconIcoPath, Buffer.concat([iconDir, entry, pngBuffer]));
}

async function applyWindowsExecutableBranding(executablePath, options) {
  if (process.platform !== "win32") {
    return;
  }

  const {
    productName,
    version,
    iconPngPath,
    iconIcoPath,
    appId,
    companyName = "",
    copyright = ""
  } = options;

  if (!fs.existsSync(executablePath)) {
    throw new Error(`Missing executable: ${executablePath}`);
  }

  const rceditOptions = {
    "product-version": version,
    "file-version": version,
    "version-string": {
      ProductName: productName,
      FileDescription: productName,
      InternalName: productName,
      OriginalFilename: path.basename(executablePath),
      CompanyName: companyName,
      LegalCopyright: copyright,
      AppUserModelID: appId
    }
  };

  if (iconPngPath && iconIcoPath && fs.existsSync(iconPngPath)) {
    await createIcoFromPng(iconPngPath, iconIcoPath);
    rceditOptions.icon = iconIcoPath;
  }

  await rcedit(executablePath, rceditOptions);
}

module.exports = {
  applyWindowsExecutableBranding
};
