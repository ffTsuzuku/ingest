import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Logger } from "../utils/logger.js";

export const GLOBAL_SKILL_DIR = join(homedir(), ".gemini", "config", "skills", "ingest");
export const WORKSPACE_SKILL_DIR = join(process.cwd(), ".agents", "skills", "ingest");

export class SkillInstaller {
  public static resolveDefaultSkillSource(): string {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      resolve(currentDir, "../../../skills/ingest/SKILL.md"), // dist/src/skill -> root
      resolve(currentDir, "../../skills/ingest/SKILL.md"),   // src/skill -> root
      resolve(process.cwd(), "skills", "ingest", "SKILL.md"),
    ];

    for (const candidate of candidatePaths) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return candidatePaths[0]!;
  }

  public static async installGlobal(sourceSkillPath?: string): Promise<string> {
    const srcPath = sourceSkillPath || this.resolveDefaultSkillSource();
    const targetFile = join(GLOBAL_SKILL_DIR, "SKILL.md");

    const content = await readFile(srcPath, "utf8");
    await mkdir(GLOBAL_SKILL_DIR, { recursive: true });
    await writeFile(targetFile, content, "utf8");

    Logger.success(`Global AI skill installed to: ${targetFile}`);
    return targetFile;
  }

  public static async installWorkspace(sourceSkillPath?: string): Promise<string> {
    const srcPath = sourceSkillPath || this.resolveDefaultSkillSource();
    const targetFile = join(WORKSPACE_SKILL_DIR, "SKILL.md");

    const content = await readFile(srcPath, "utf8");
    await mkdir(WORKSPACE_SKILL_DIR, { recursive: true });
    await writeFile(targetFile, content, "utf8");

    Logger.success(`Workspace AI skill installed to: ${targetFile}`);
    return targetFile;
  }
}
