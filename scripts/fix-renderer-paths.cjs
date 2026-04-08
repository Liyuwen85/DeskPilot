const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "dist", "renderer", "index.html");

if (!fs.existsSync(indexPath)) {
  process.exit(0);
}

const original = fs.readFileSync(indexPath, "utf-8");
const updated = original
  .replace(/src="\/assets\//g, 'src="./assets/')
  .replace(/href="\/assets\//g, 'href="./assets/');

if (updated !== original) {
  fs.writeFileSync(indexPath, updated, "utf-8");
}
