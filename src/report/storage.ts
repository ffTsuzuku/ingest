import { mkdir, readdir, readFile, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { GeneratedReport, ReportMeta, ReportSummary, TokenUsage } from "./types.js";
import { parseTokenUsageFromMarkdown } from "../ai/tokens.js";

export class ReportStorage {
  public static getReportFilePath(
    outputRoot: string,
    repoName: string,
    dateStr: string,
    reportStyle?: string,
    branch?: string,
  ): string {
    const branchSuffix =
      branch && branch.trim() !== ""
        ? `-${branch.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-")}`
        : "";
    const styleSuffix =
      reportStyle && reportStyle !== "default" && reportStyle.trim() !== ""
        ? `-${reportStyle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`
        : "";
    return join(outputRoot, repoName, `${dateStr}${branchSuffix}${styleSuffix}-summary.md`);
  }

  public static parseReportFileName(fileName: string): {
    dateStr: string;
    branch?: string;
    reportStyle?: string;
  } {
    const match = fileName.match(/^(\d{4}-\d{2}-\d{2}(?:-to-\d{4}-\d{2}-\d{2})?)(?:-(.+?))?-summary\.md$/);
    if (!match) {
      const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2}(?:-to-(\d{4}-\d{2}-\d{2}))?)/);
      const dateStr = dateMatch ? (dateMatch[1] ?? fileName) : fileName.replace(/-summary\.md$/, "");
      return { dateStr };
    }

    const dateStr = match[1]!;
    const extra = match[2];

    if (!extra) {
      return { dateStr };
    }

    const KNOWN_STYLES = new Set(["system-centric", "default", "changelog", "security"]);

    if (KNOWN_STYLES.has(extra)) {
      return { dateStr, reportStyle: extra };
    }

    for (const style of KNOWN_STYLES) {
      if (extra.endsWith(`-${style}`)) {
        const branchPart = extra.slice(0, -(style.length + 1));
        if (branchPart.length > 0) {
          return {
            dateStr,
            branch: branchPart,
            reportStyle: style,
          };
        }
      }
    }

    return {
      dateStr,
      branch: extra,
    };
  }

    public static getWorkspaceRollupFilePath(
    outputRoot: string,
    dateStr: string,
    reportStyle?: string,
  ): string {
    const styleSuffix =
      reportStyle && reportStyle !== "default" && reportStyle.trim() !== ""
        ? `-${reportStyle.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`
        : "";
    return join(outputRoot, "_workspace", `${dateStr}-rollup${styleSuffix}-summary.md`);
  }

  public static async saveWorkspaceRollup(
    outputRoot: string,
    meta: ReportMeta,
    markdownContent: string,
  ): Promise<GeneratedReport> {
    const effectiveMeta: ReportMeta = {
      ...meta,
      repoName: "_workspace",
      branch: meta.branch || "rollup",
    };
    const filePath = this.getWorkspaceRollupFilePath(outputRoot, effectiveMeta.dateStr, effectiveMeta.reportStyle);
    const targetDir = join(outputRoot, "_workspace");

    await mkdir(targetDir, { recursive: true });
    await writeFile(filePath, markdownContent, "utf8");

    return {
      meta: effectiveMeta,
      markdownContent,
      filePath,
    };
  }

  public static async saveReport(
    outputRoot: string,
    meta: ReportMeta,
    markdownContent: string,
  ): Promise<GeneratedReport> {
    const filePath = this.getReportFilePath(outputRoot, meta.repoName, meta.dateStr, meta.reportStyle, meta.branch);
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
              const parsed = this.parseReportFileName(file.name);
              const dateStr = parsed.dateStr;
              let reportStyle = parsed.reportStyle;
              let branch = parsed.branch;

              let tokenUsage: TokenUsage | undefined = undefined;
              try {
                const content = await readFile(fullPath, "utf8");
                tokenUsage = parseTokenUsageFromMarkdown(content) || undefined;
                if (!branch) {
                  const branchMatch = content.match(/commits analyzed across branch:\s*([^\s)]+)/i);
                  if (branchMatch && branchMatch[1]) {
                    branch = branchMatch[1];
                  }
                }
              } catch {
                // Ignore read error
              }

              reports.push({
                filePath: fullPath,
                fileName: file.name,
                repoName,
                dateStr,
                branch,
                sizeBytes: fileStats.size,
                modifiedAt: fileStats.mtime,
                reportStyle,
                tokenUsage,
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

    // Sort by date descending, then by branch ascending, then by modification time descending
    return reports.sort((a, b) => {
      const dateCmp = b.dateStr.localeCompare(a.dateStr);
      if (dateCmp !== 0) return dateCmp;
      if (a.branch && b.branch && a.branch !== b.branch) {
        return a.branch.localeCompare(b.branch);
      }
      return b.modifiedAt.getTime() - a.modifiedAt.getTime();
    });
  }

  public static groupReportsByRepo(reports: ReportSummary[]): Map<string, ReportSummary[]> {
    const map = new Map<string, ReportSummary[]>();
    for (const report of reports) {
      const list = map.get(report.repoName) || [];
      list.push(report);
      map.set(report.repoName, list);
    }
    return map;
  }

  public static filterReports(reports: ReportSummary[], query: string): ReportSummary[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return reports;
    }

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    return reports.filter((report) => {
      const searchable = [
        report.repoName,
        report.dateStr,
        report.branch ?? "",
        report.reportStyle ?? "",
        report.fileName,
      ]
        .join(" ")
        .toLowerCase();

      return tokens.every((token) => searchable.includes(token));
    });
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
