import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import { exec } from "node:child_process";
import { renderDashboardHtml } from "./html.js";
import { ReportStorage } from "../report/storage.js";
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
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((err) => (err ? reject(err) : resolve()));
      });
      this.server = null;
    }
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

      readFile(targetFilePath, "utf8")
        .then((content) => {
          sendJson(200, {
            repoName: repoParam,
            fileName: fileParam,
            filePath: targetFilePath,
            content,
          });
        })
        .catch((err) => {
          sendError(404, `Report not found: ${String(err)}`);
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
