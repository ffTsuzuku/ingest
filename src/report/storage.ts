import { mkdir, readdir, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { GeneratedReport, ReportMeta, ReportSummary } from "./types.js";

export class ReportStorage {
  public static getReportFilePath(
    outputRoot: string,
    repoName: string,
    dateStr: string,
    reportStyle?: string,
  ): string {
    const styleSuffix =
      reportStyle && reportStyle !== "default" && reportStyle.trim() !== ""
        ? `-${reportStyle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`
        : "";
    return join(outputRoot, repoName, `${dateStr}${styleSuffix}-summary.md`);
  }

  public static async saveReport(
    outputRoot: string,
    meta: ReportMeta,
    markdownContent: string,
  ): Promise<GeneratedReport> {
    const filePath = this.getReportFilePath(outputRoot, meta.repoName, meta.dateStr, meta.reportStyle);
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
              const styleMatch = file.name.match(/^(\d{4}-\d{2}-\d{2}(?:-to-\d{4}-\d{2}-\d{2})?)(?:-(.+?))?-summary\.md$/);
              const dateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2}(?:-to-(\d{4}-\d{2}-\d{2}))?)/);
              const dateStr = styleMatch ? (styleMatch[1] ?? file.name) : (dateMatch ? (dateMatch[1] ?? file.name) : file.name.replace(/-summary\.md$/, ""));
              const reportStyle = styleMatch && styleMatch[2] ? styleMatch[2] : undefined;

              reports.push({
                filePath: fullPath,
                fileName: file.name,
                repoName,
                dateStr,
                sizeBytes: fileStats.size,
                modifiedAt: fileStats.mtime,
                reportStyle,
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

  public static async listRepositories(
    outputRoot: string,
  ): Promise<Array<{ repoName: string; reportCount: number; latestDate: string; latestModified: Date }>> {
    const allReports = await this.listReports(outputRoot);
    const repoMap = new Map<string, { repoName: string; reportCount: number; latestDate: string; latestModified: Date }>();

    for (const report of allReports) {
      const existing = repoMap.get(report.repoName);
      if (!existing) {
        repoMap.set(report.repoName, {
          repoName: report.repoName,
          reportCount: 1,
          latestDate: report.dateStr,
          latestModified: report.modifiedAt,
        });
      } else {
        existing.reportCount++;
        if (report.dateStr.localeCompare(existing.latestDate) > 0) {
          existing.latestDate = report.dateStr;
        }
        if (report.modifiedAt > existing.latestModified) {
          existing.latestModified = report.modifiedAt;
        }
      }
    }

    return Array.from(repoMap.values()).sort((a, b) => a.repoName.localeCompare(b.repoName));
  }

  public static async cleanExpiredReports(
    outputRoot: string,
    retentionDays: number,
    now: Date = new Date(),
  ): Promise<string[]> {
    if (retentionDays <= 0) {
      return [];
    }

    const cutoffTime = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
    const allReports = await this.listReports(outputRoot);
    const deletedPaths: string[] = [];
    const affectedRepoDirs = new Set<string>();

    for (const report of allReports) {
      let reportTime: number | null = null;

      if (report.dateStr.includes("-to-")) {
        const parts = report.dateStr.split("-to-");
        const endDateStr = parts[1];
        if (endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
          const parsed = new Date(`${endDateStr}T23:59:59.999Z`).getTime();
          if (!isNaN(parsed)) reportTime = parsed;
        }
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(report.dateStr)) {
        const parsed = new Date(`${report.dateStr}T23:59:59.999Z`).getTime();
        if (!isNaN(parsed)) reportTime = parsed;
      }

      if (reportTime === null) {
        reportTime = report.modifiedAt.getTime();
      }

      if (reportTime < cutoffTime) {
        try {
          await unlink(report.filePath);
          deletedPaths.push(report.filePath);
          affectedRepoDirs.add(join(outputRoot, report.repoName));
        } catch {
          // Ignore individual file removal failure
        }
      }
    }

    // Clean up empty repo directories
    for (const repoDir of affectedRepoDirs) {
      try {
        const remaining = await readdir(repoDir);
        if (remaining.length === 0) {
          await rmdir(repoDir);
        }
      } catch {
        // Ignore rmdir error
      }
    }

    return deletedPaths;
  }
}
