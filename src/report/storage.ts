import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { GeneratedReport, ReportMeta, ReportSummary } from "./types.js";

export class ReportStorage {
  public static getReportFilePath(outputRoot: string, repoName: string, dateStr: string): string {
    return join(outputRoot, repoName, `${dateStr}-summary.md`);
  }

  public static async saveReport(
    outputRoot: string,
    meta: ReportMeta,
    markdownContent: string,
  ): Promise<GeneratedReport> {
    const filePath = this.getReportFilePath(outputRoot, meta.repoName, meta.dateStr);
    const targetDir = join(outputRoot, meta.repoName);

    await mkdir(targetDir, { recursive: true });
    await writeFile(filePath, markdownContent, "utf8");

    return {
      meta,
      markdownContent,
      filePath,
    };
  }

  public static async listReports(outputRoot: string, filterRepoName?: string): Promise<ReportSummary[]> {
    const reports: ReportSummary[] = [];

    try {
      const repoEntries = await readdir(outputRoot, { withFileTypes: true });

      for (const entry of repoEntries) {
        if (!entry.isDirectory()) continue;
        const repoName = entry.name;
        if (filterRepoName && repoName !== filterRepoName) continue;

        const repoDir = join(outputRoot, repoName);
        try {
          const files = await readdir(repoDir, { withFileTypes: true });
          for (const file of files) {
            if (file.isFile() && file.name.endsWith(".md")) {
              const fullPath = join(repoDir, file.name);
              const fileStats = await stat(fullPath);
              const dateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2}(?:-to-\d{4}-\d{2}-\d{2})?)/);
              const dateStr = dateMatch ? (dateMatch[1] ?? file.name) : file.name.replace(/-summary\.md$/, "");

              reports.push({
                filePath: fullPath,
                fileName: file.name,
                repoName,
                dateStr,
                sizeBytes: fileStats.size,
                modifiedAt: fileStats.mtime,
              });
            }
          }
        } catch {
          // Ignore subfolder read error
        }
      }
    } catch {
      // Output root might not exist yet
    }

    // Sort by date descending
    return reports.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }
}
