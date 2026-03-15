import { readFileSync, writeFileSync, chmodSync } from "fs";

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "node",
  format: "esm",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Replace Bun shebang with Node shebang
const outFile = "./dist/index.js";
let content = readFileSync(outFile, "utf-8");
content = content.replace("#!/usr/bin/env bun", "#!/usr/bin/env node");
writeFileSync(outFile, content);
chmodSync(outFile, 0o755);

console.log("Build complete: dist/index.js");
