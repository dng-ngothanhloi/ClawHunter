import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const root = new URL("../services/api/src", import.meta.url).pathname;

const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (extname(p) === ".ts") {
      let s = readFileSync(p, "utf8");
      const before = s;
      s = s.replace(/(from\s+['"])(\.\.?\/[^'".]+)(['"])/g, "$1$2.js$3");
      if (s !== before) writeFileSync(p, s);
    }
  }
};
walk(root);
console.log("✔ added .js to relative ESM imports");
