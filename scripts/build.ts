import { readFileSync, writeFileSync, chmodSync } from "fs";

const result = await Bun.build({
  entrypoints: ["./src/cli.ts"],
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

// Ensure Node shebang
const outFile = "./dist/cli.js";
let content = readFileSync(outFile, "utf-8");
content = content.replace("#!/usr/bin/env bun", "#!/usr/bin/env node");
if (!content.startsWith("#!")) {
  content = "#!/usr/bin/env node\n" + content;
}
writeFileSync(outFile, content);
chmodSync(outFile, 0o755);

console.log("Build complete: dist/cli.js");
