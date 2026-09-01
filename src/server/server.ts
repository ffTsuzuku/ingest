import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Socket } from "node:net";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { exec } from "node:child_process";
import { renderDashboardHtml } from "./html.js";
import { ReportStorage } from "../report/storage.js";
import { ConfigManager } from "../config/manager.js";
import { AIFactory } from "../ai/factory.js";
import { repairReportMarkdown, repairMermaidDiagram } from "../ai/repair.js";
import { parseTokenUsageFromMarkdown } from "../ai/tokens.js";
import { Logger } from "../utils/logger.js";

export interface ServerOptions {
  port?: number;
  outputRoot: string;
  activeRepo?: string | null;
  openBrowser?: boolean;
}

export interface RunningServerInfo {
  server: Server;
  url: string;
  port: number;
  outputRoot: string;
  activeRepo: string | null;
}

export class IngestWebServer {
  private server: Server | null = null;
  private options: ServerOptions;
  private sockets = new Set<Socket>();
  private stoppingPromise: Promise<void> | null = null;

  constructor(options: ServerOptions) {
    this.options = options;
  }

  public async start(): Promise<RunningServerInfo> {
    const initialPort = this.options.port || 3456;
    const outputRoot = resolve(this.options.outputRoot);
    const activeRepo = this.options.activeRepo || null;

    const { server, port } = await this.listenWithRetry(initialPort);
    this.server = server;
    const url = `http://localhost:${port}`;

    if (this.options.openBrowser !== false) {
      this.openInBrowser(url);
    }

    return {
      server,
      url,
      port,
      outputRoot,
      activeRepo,
    };
  }

  public async stop(): Promise<void> {
    if (this.stoppingPromise) {
      return this.stoppingPromise;
    }
    if (!this.server) {
      return;
    }

    const currentServer = this.server;
    this.server = null;

    this.stoppingPromise = new Promise<void>((resolve) => {
      // Forcefully terminate open keep-alive connections so server.close() doesn't hang
      if (typeof currentServer.closeAllConnections === "function") {
        currentServer.closeAllConnections();
      } else if (typeof currentServer.closeIdleConnections === "function") {
        currentServer.closeIdleConnections();
      }

      for (const socket of this.sockets) {
        socket.destroy();
      }
      this.sockets.clear();

      currentServer.close(() => {
        resolve();
      });
    });

    return this.stoppingPromise;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const outputRoot = resolve(this.options.outputRoot);
    const activeRepo = this.options.activeRepo || null;
    const reqUrl = req.url || "/";
    const parsedUrl = new URL(reqUrl, `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    // Helper responses
    const sendJson = (status: number, data: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(JSON.stringify(data));
    };

    const sendHtml = (status: number, html: string) => {
      res.writeHead(status, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(html);
    };

    const sendError = (status: number, message: string) => {
      sendJson(status, { error: message });
    };

    // Route handling
    if (pathname === "/" || pathname === "/index.html") {
      sendHtml(200, renderDashboardHtml());
      return;
    }

    if (pathname === "/api/status") {
      sendJson(200, {
        activeRepo,
        outputRoot,
      });
      return;
    }

    if (pathname === "/api/repos") {
      ReportStorage.listRepositories(outputRoot)
        .then((repos) => sendJson(200, repos))
        .catch((err) => sendError(500, `Failed to list repositories: ${String(err)}`));
      return;
    }

    if (pathname === "/api/reports") {
      const repoParam = parsedUrl.searchParams.get("repo") || undefined;
      ReportStorage.listReports(outputRoot, repoParam)
        .then((reports) => sendJson(200, reports))
        .catch((err) => sendError(500, `Failed to list reports: ${String(err)}`));
      return;
    }

    if (pathname === "/api/report") {
      const repoParam = parsedUrl.searchParams.get("repo");
      const fileParam = parsedUrl.searchParams.get("file");

      if (!repoParam || !fileParam) {
        sendError(400, "Missing 'repo' or 'file' query parameter");
        return;
      }

      // Security check against directory traversal
      const targetFilePath = normalize(join(outputRoot, repoParam, fileParam));
      if (!targetFilePath.startsWith(outputRoot)) {
        sendError(403, "Access denied: Path traversal detected");
        return;
      }

      if (req.method === "DELETE") {
        ReportStorage.deleteReport(outputRoot, repoParam, fileParam)
          .then((deleted) => {
            if (deleted) {
              sendJson(200, {
                success: true,
                repoName: repoParam,
                fileName: fileParam,
                message: "Report deleted successfully",
              });
            } else {
              sendError(404, "Report not found or could not be deleted");
            }
          })
          .catch((err) => {
            sendError(500, `Failed to delete report: ${String(err)}`);
          });
        return;
      }

      readFile(targetFilePath, "utf8")
        .then((content) => {
          sendJson(200, {
            repoName: repoParam,
            fileName: fileParam,
            filePath: targetFilePath,
            content,
            tokenUsage: parseTokenUsageFromMarkdown(content),
          });
        })
        .catch((err) => {
          sendError(404, `Report not found: ${String(err)}`);
        });
      return;
    }

    if (pathname === "/api/report/delete" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}") as { repo?: string; file?: string };
          if (!parsed.repo || !parsed.file) {
            sendError(400, "Missing 'repo' or 'file' parameter");
            return;
          }
          const targetFilePath = normalize(join(outputRoot, parsed.repo, parsed.file));
          if (!targetFilePath.startsWith(outputRoot)) {
            sendError(403, "Access denied: Path traversal detected");
            return;
          }
          const deleted = await ReportStorage.deleteReport(outputRoot, parsed.repo, parsed.file);
          if (deleted) {
            sendJson(200, {
              success: true,
              repoName: parsed.repo,
              fileName: parsed.file,
              message: "Report deleted successfully",
            });
          } else {
            sendError(404, "Report not found or could not be deleted");
          }
        } catch (err) {
          sendError(500, `Failed to delete report: ${String(err)}`);
        }
      });
      return;
    }

    if (pathname === "/api/fix-mermaid" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}") as {
            repo?: string;
            file?: string;
            mermaidCode?: string;
          };

          if (!parsed.repo || !parsed.file) {
            sendError(400, "Missing 'repo' or 'file' parameter");
            return;
          }

          const targetFilePath = normalize(join(outputRoot, parsed.repo, parsed.file));
          if (!targetFilePath.startsWith(outputRoot)) {
            sendError(403, "Access denied: Path traversal detected");
            return;
          }

          const content = await readFile(targetFilePath, "utf8");
          const config = await ConfigManager.load();
          const provider = AIFactory.getProvider(config);

          let updatedContent = content;
          let repairedCount = 0;

          if (parsed.mermaidCode && parsed.mermaidCode.trim()) {
            const repaired = await repairMermaidDiagram(parsed.mermaidCode, provider);
            if (content.includes(parsed.mermaidCode.trim())) {
              updatedContent = content.replace(parsed.mermaidCode.trim(), repaired);
              repairedCount = 1;
            } else {
              const res = await repairReportMarkdown(content, provider);
              updatedContent = res.repairedMarkdown;
              repairedCount = res.repairedCount;
            }
          } else {
            const res = await repairReportMarkdown(content, provider);
            updatedContent = res.repairedMarkdown;
            repairedCount = res.repairedCount;
          }

          await writeFile(targetFilePath, updatedContent, "utf8");

          sendJson(200, {
            success: true,
            repoName: parsed.repo,
            fileName: parsed.file,
            content: updatedContent,
            repairedCount,
            tokenUsage: parseTokenUsageFromMarkdown(updatedContent),
          });
        } catch (err) {
          sendError(500, `Failed to repair Mermaid diagram: ${String(err)}`);
        }
      });
      return;
    }

    sendError(404, "Not Found");
  }

  private listenWithRetry(startPort: number, maxRetries = 10): Promise<{ server: Server; port: number }> {
    return new Promise((resolvePromise, rejectPromise) => {
      let currentPort = startPort;
      let attempts = 0;

      const tryListen = () => {
        const server = createServer((req, res) => this.handleRequest(req, res));

        server.on("connection", (socket) => {
          this.sockets.add(socket);
          socket.once("close", () => {
            this.sockets.delete(socket);
          });
        });

        server.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE" && attempts < maxRetries) {
            attempts++;
            currentPort++;
            tryListen();
          } else {
            rejectPromise(err);
          }
        });

        server.once("listening", () => {
          resolvePromise({ server, port: currentPort });
        });

        server.listen(currentPort);
      };

      tryListen();
    });
  }

  private openInBrowser(url: string): void {
    const platform = process.platform;
    let command = "";

    if (platform === "darwin") {
      command = `open "${url}"`;
    } else if (platform === "win32") {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (err) => {
      if (err) {
        Logger.warn(`Could not automatically open browser: ${err.message}`);
      }
    });
  }
}
