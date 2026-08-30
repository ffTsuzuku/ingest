import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { executeCommand } from "./command.js";
import { Logger } from "./logger.js";

export async function verifyDocsAndIntegrity(): Promise<boolean> {
  const root = process.cwd();
  const requiredFiles = [
    "AGENTS.md",
    "README.md",
    "docs/architecture.md",
    "docs/coding-standards.md",
    "docs/extension-guide.md",
    "docs/self-documentation.md",
    "skills/ingest/SKILL.md",
    "src/index.ts",
  ];

  console.log("\x1b[36m🔍 Verifying documentation and repository integrity...\x1b[0m");

  let allOk = true;

  for (const relPath of requiredFiles) {
    const fullPath = join(root, relPath);
    try {
      await access(fullPath);
      console.log(`  \x1b[32m✔\x1b[0m Found ${relPath}`);
    } catch {
      console.error(`  \x1b[31m✖ Missing required documentation file: ${relPath}\x1b[0m`);
      allOk = false;
    }
  }

  // Verify skill frontmatter
  try {
    const skillContent = await readFile(join(root, "skills/ingest/SKILL.md"), "utf8");
    if (!skillContent.startsWith("---") || !skillContent.includes("name: ingest")) {
      console.error("  \x1b[31m✖ Invalid skill YAML frontmatter in skills/ingest/SKILL.md\x1b[0m");
      allOk = false;
    } else {
      console.log("  \x1b[32m✔\x1b[0m Skill definition format valid");
    }
  } catch (err) {
    console.error("  \x1b[31m✖ Failed to read skill definition:\x1b[0m", err);
    allOk = false;
  }

  // Run typescript typecheck
  try {
    console.log("  \x1b[36mℹ\x1b[0m Running TypeScript compiler verification (tsc --noEmit)...");
    const tscRes = await executeCommand("npx", ["tsc", "--noEmit"]);
    if (tscRes.exitCode === 0) {
      console.log("  \x1b[32m✔\x1b[0m TypeScript typecheck passed with 0 errors");
    } else {
      console.error("  \x1b[31m✖ TypeScript errors detected:\x1b[0m\n" + tscRes.stdout + "\n" + tscRes.stderr);
      allOk = false;
    }
  } catch (err) {
    console.error("  \x1b[31m✖ Failed to run tsc:\x1b[0m", err);
    allOk = false;
  }

  return allOk;
}

if (process.argv[1]?.endsWith("verify.ts") || process.argv[1]?.endsWith("verify.js")) {
  verifyDocsAndIntegrity().then((ok) => {
    if (!ok) {
      process.exit(1);
    }
  });
}
