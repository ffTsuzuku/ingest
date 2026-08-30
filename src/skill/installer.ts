import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Logger } from "../utils/logger.js";

export const GLOBAL_SKILL_DIR = join(homedir(), ".gemini", "config", "skills", "git-ingest");
export const WORKSPACE_SKILL_DIR = join(process.cwd(), ".agents", "skills", "git-ingest");

export class SkillInstaller {
  public static async installGlobal(sourceSkillPath?: string): Promise<string> {
    const defaultSource = resolve(process.cwd(), "skills", "git-ingest", "SKILL.md");
    const srcPath = sourceSkillPath || defaultSource;
    const targetFile = join(GLOBAL_SKILL_DIR, "SKILL.md");

    const content = await readFile(srcPath, "utf8");
    await mkdir(GLOBAL_SKILL_DIR, { recursive: true });
    await writeFile(targetFile, content, "utf8");

    Logger.success(`Global AI skill installed to: ${targetFile}`);
    return targetFile;
  }

  public static async installWorkspace(sourceSkillPath?: string): Promise<string> {
    const defaultSource = resolve(process.cwd(), "skills", "git-ingest", "SKILL.md");
    const srcPath = sourceSkillPath || defaultSource;
    const targetFile = join(WORKSPACE_SKILL_DIR, "SKILL.md");

    const content = await readFile(srcPath, "utf8");
    await mkdir(WORKSPACE_SKILL_DIR, { recursive: true });
    await writeFile(targetFile, content, "utf8");

    Logger.success(`Workspace AI skill installed to: ${targetFile}`);
    return targetFile;
  }
}
