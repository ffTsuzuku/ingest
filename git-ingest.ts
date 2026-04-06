import { access, appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

type Nullable<T> = T | null;

interface RepoConfig {
  path: string;
  repo_name?: Nullable<string>;
  branches: string[];
}

interface OpencodeProviderConfig {
  provider: string;
  model: string;
}

interface GeminiCliProviderConfig {
  model: string;
  gemini_api_key_file?: string;
}

interface AgentConfig {
  opencode?: OpencodeProviderConfig;
  "gemini-cli"?: GeminiCliProviderConfig;
}

interface RawConfig {
  repos: RepoConfig[];
  output_root?: string;
  error_log?: string;
  agents?: AgentConfig;
  provider?: AgentConfig;
  prompt?: string;
}

interface AppConfig {
  repos: Array<RepoConfig & { repo_name: Nullable<string> }>;
  outputRoot: string;
  rawOutputRoot: string;
  errorLogPath: string;
  agents: AgentConfig;
  prompt: string;
}

interface CommitRecord {
  hash: string;
  author: string;
  email: string;
  subject: string;
  body: string;
  branch: string;
  filesChanged: string[];
}

interface AggregatedAnalysis {
  commitSummary: string[];
  keyChanges: string[];
  contributors: string[];
  narrative: string;
  rawResponse?: string;
  rawResponseSource?: string;
}

interface AgentAnalysisResult {
  content: string;
  rawResult: string;
  providerLabel: string;
}

const DEFAULT_CONFIG_PATH = "~/.config/git-ingest/config.jsonc";
const DEFAULT_OUTPUT_ROOT = join(homedir(), "reports");
const DEFAULT_ERROR_LOG = "error.log";
const DEFAULT_PROMPT =
  "Summarize repo activity from last 24h: commit messages, authors, key patterns, overall narrative.";

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      resolvePromise({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    if (options.input) {
      child.stdin.write(options.input);
    }

    child.stdin.end();
  });
}

function expandHomePath(inputPath: string): string {
  if (inputPath === "~") {
    return homedir();
  }

  if (inputPath.startsWith("~/")) {
    return join(homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function resolvePath(inputPath: string, baseDir = process.cwd()): string {
  const expanded = expandHomePath(inputPath);
  return isAbsolute(expanded) ? expanded : resolve(baseDir, expanded);
}

function stripJsonComments(source: string): string {
  let result = "";
  let inString = false;
  let stringDelimiter = "";

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (inString) {
      result += current;
      if (current === stringDelimiter && previous !== "\\") {
        inString = false;
        stringDelimiter = "";
      }
      continue;
    }

    if (current === "\"" || current === "'") {
      inString = true;
      stringDelimiter = current;
      result += current;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      result += "\n";
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

function validateConfig(config: RawConfig, configPath: string): AppConfig {
  if (!Array.isArray(config.repos) || config.repos.length === 0) {
    throw new Error(`Config at ${configPath} must include a non-empty "repos" array.`);
  }

  const repos = config.repos.map((repo, index) => {
    if (!repo || typeof repo !== "object") {
      throw new Error(`Config repo at index ${index} must be an object.`);
    }

    if (!repo.path || typeof repo.path !== "string") {
      throw new Error(`Config repo at index ${index} must include a string "path".`);
    }

    if (!Array.isArray(repo.branches) || repo.branches.length === 0 || repo.branches.some((branch) => typeof branch !== "string")) {
      throw new Error(`Config repo at index ${index} must include a non-empty string[] "branches".`);
    }

    return {
      path: repo.path,
      repo_name: repo.repo_name ?? null,
      branches: repo.branches,
    };
  });

  const agents = config.agents ?? config.provider;
  if (!agents || (!agents.opencode && !agents["gemini-cli"])) {
    throw new Error(`Config at ${configPath} must include either agents.opencode or agents["gemini-cli"].`);
  }

  return {
    repos,
    outputRoot: resolvePath(config.output_root ?? DEFAULT_OUTPUT_ROOT, dirname(configPath)),
    rawOutputRoot: dirname(configPath),
    errorLogPath: resolvePath(config.error_log ?? DEFAULT_ERROR_LOG, dirname(configPath)),
    agents,
    prompt: config.prompt?.trim() || DEFAULT_PROMPT,
  };
}

async function parseConfig(configPathArg?: string): Promise<{ config: AppConfig; configPath: string }> {
  const configPath = resolvePath(configPathArg ?? DEFAULT_CONFIG_PATH);
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(stripJsonComments(raw)) as RawConfig;
  return {
    config: validateConfig(parsed, configPath),
    configPath,
  };
}

async function ensureRepo(repoPath: string): Promise<void> {
  const resolved = resolvePath(repoPath);
  const repoStat = await stat(resolved).catch(() => null);
  if (!repoStat?.isDirectory()) {
    throw new Error(`Repository path does not exist or is not a directory: ${resolved}`);
  }

  const gitDir = join(resolved, ".git");
  await access(gitDir).catch(() => {
    throw new Error(`Repository path is not a git repository: ${resolved}`);
  });
}

async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  const result = await runCommand("git", ["rev-parse", "--verify", branch], { cwd: repoPath });
  return result.exitCode === 0;
}

async function getCommitFiles(repoPath: string, hash: string): Promise<string[]> {
  const result = await runCommand("git", ["show", "--stat", "--format=", "--name-only", hash], { cwd: repoPath });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Failed to inspect files for commit ${hash}.`);
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
}

async function getCommits(repoPath: string, branches: string[]): Promise<CommitRecord[]> {
  const allCommits = new Map<string, CommitRecord>();

  for (const branch of branches) {
    const exists = await branchExists(repoPath, branch);
    if (!exists) {
      throw new Error(`Branch "${branch}" was not found in ${repoPath}.`);
    }

    const logResult = await runCommand(
      "git",
      ["log", branch, '--since=24 hours ago', "--format=%H%x1f%an%x1f%ae%x1f%s%x1f%b%x1e"],
      { cwd: repoPath },
    );

    if (logResult.exitCode !== 0) {
      throw new Error(logResult.stderr.trim() || `Failed to collect commits for branch ${branch}.`);
    }

    const entries = logResult.stdout.split("\x1e").map((entry) => entry.trim()).filter(Boolean);

    for (const entry of entries) {
      const [hash, author, email, subject, body = ""] = entry.split("\x1f");
      if (!hash || allCommits.has(hash)) {
        continue;
      }

      const filesChanged = await getCommitFiles(repoPath, hash);
      allCommits.set(hash, {
        hash,
        author,
        email,
        subject,
        body: body.trim(),
        branch,
        filesChanged,
      });
    }
  }

  return Array.from(allCommits.values());
}

function buildAnalysisPrompt(repoName: string, branches: string[], commits: CommitRecord[], userPrompt: string): string {
  const commitBlock = commits
    .map((commit) => {
      const files = commit.filesChanged.length > 0 ? commit.filesChanged.join(", ") : "No files detected";
      const body = commit.body ? `Body: ${commit.body}\n` : "";
      return [
        `Commit: ${commit.hash}`,
        `Branch: ${commit.branch}`,
        `Author: ${commit.author} <${commit.email}>`,
        `Subject: ${commit.subject}`,
        body ? body.trimEnd() : null,
        `Files: ${files}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    "You are analyzing git commit activity for a repository report.",
    `Repository: ${repoName}`,
    `Time window: Last 24 hours from ${new Date().toISOString()}`,
    `Branches analyzed: ${branches.join(", ")}`,
    `Total commits: ${commits.length}`,
    "",
    "Follow this user intent:",
    userPrompt,
    "",
    "Use this exact output structure:",
    `# ${repoName} - ${new Date().toISOString().slice(0, 10)}`,
    "## Commit Summary",
    "<bulleted list of commits with who/what/files>",
    "## Key Changes",
    "<bulleted list categorized by type>",
    "## Contributors",
    "<comma-separated names sorted by contribution count>",
    "## Overall Narrative",
    "<2-4 sentence paragraph>",
    "",
    "Commits:",
    commitBlock,
  ].join("\n");
}

async function analyzeWithOpencode(prompt: string, provider: OpencodeProviderConfig): Promise<AgentAnalysisResult> {
  const result = await runCommand("opencode", ["run", "--format", "json", "--model", `${provider.provider}/${provider.model}`, prompt]);

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Opencode CLI invocation failed.");
  }

  const rawResult = result.stdout.trim();
  const jsonLines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = jsonLines.length - 1; index >= 0; index -= 1) {
    const line = jsonLines[index];
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const message =
        (typeof parsed.content === "string" && parsed.content) ||
        (typeof parsed.text === "string" && parsed.text) ||
        (typeof parsed.message === "string" && parsed.message);
      if (message) {
        return {
          content: message.trim(),
          rawResult,
          providerLabel: `opencode-cli:${provider.provider}/${provider.model}`,
        };
      }
    } catch {
      continue;
    }
  }

  if (!rawResult) {
    throw new Error("Opencode CLI returned an empty response.");
  }

  return {
    content: rawResult,
    rawResult,
    providerLabel: `opencode-cli:${provider.provider}/${provider.model}`,
  };
}

async function analyzeWithGeminiCli(prompt: string, provider: GeminiCliProviderConfig): Promise<AgentAnalysisResult> {
  const env: NodeJS.ProcessEnv = {};
  if (provider.gemini_api_key_file) {
    env.GEMINI_API_KEY_FILE = resolvePath(provider.gemini_api_key_file);
  }

  const result = await runCommand("gemini", ["--model", provider.model], {
    input: prompt,
    env,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Gemini CLI invocation failed.");
  }

  const content = result.stdout.trim();
  if (!content) {
    throw new Error("Gemini CLI returned an empty response.");
  }

  return {
    content,
    rawResult: content,
    providerLabel: `gemini-cli:${provider.model}`,
  };
}

function parseAiResponse(response: string): AggregatedAnalysis {
  const lines = response.split("\n");
  const sections = new Map<string, string[]>();
  let currentSection = "";

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.*)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      sections.set(currentSection, []);
      continue;
    }

    if (currentSection) {
      sections.get(currentSection)?.push(line);
    }
  }

  const commitSummary = (sections.get("Commit Summary") ?? []).map((line) => line.trim()).filter(Boolean);
  const keyChanges = (sections.get("Key Changes") ?? []).map((line) => line.trim()).filter(Boolean);
  const contributorsRaw = (sections.get("Contributors") ?? []).join(" ").trim();
  const contributors = contributorsRaw
    ? contributorsRaw.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  const narrative = (sections.get("Overall Narrative") ?? []).join("\n").trim();

  return {
    commitSummary,
    keyChanges,
    contributors,
    narrative,
    rawResponse: response,
  };
}

function buildDeterministicAnalysis(commits: CommitRecord[]): AggregatedAnalysis {
  const contributors = new Map<string, number>();
  const featureKeywords = /\b(add|feat|feature)\b/i;
  const fixKeywords = /\b(fix|bug|hotfix|regression)\b/i;
  const breakingKeywords = /\b(breaking change|! )\b/i;

  for (const commit of commits) {
    contributors.set(commit.author, (contributors.get(commit.author) ?? 0) + 1);
  }

  const commitSummary = commits.map((commit) => {
    const files = commit.filesChanged.length > 0 ? commit.filesChanged.join(", ") : "No files detected";
    return `- Who: ${commit.author} <${commit.email}>  What: ${commit.subject}  Files: ${files}`;
  });

  const keyChanges = commits.flatMap((commit) => {
    if (featureKeywords.test(commit.subject)) {
      return [`- Feature Additions: ${commit.subject}`];
    }
    if (fixKeywords.test(commit.subject)) {
      return [`- Bug Fixes: ${commit.subject}`];
    }
    if (breakingKeywords.test(commit.subject) || breakingKeywords.test(commit.body)) {
      return [`- Breaking Changes: ${commit.subject}`];
    }
    return [`- Other: ${commit.subject}`];
  });

  const sortedContributors = Array.from(contributors.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([name]) => name);

  const narrative =
    commits.length === 0
      ? "No commits were recorded in the last 24 hours."
      : `The repository had ${commits.length} commit${commits.length === 1 ? "" : "s"} in the last 24 hours across ${sortedContributors.length} contributor${sortedContributors.length === 1 ? "" : "s"}. Activity was centered on ${commits.map((commit) => `"${commit.subject}"`).slice(0, 3).join(", ")}.`;

  return {
    commitSummary,
    keyChanges,
    contributors: sortedContributors,
    narrative,
  };
}

function mergeAnalysis(base: AggregatedAnalysis, overlay: AggregatedAnalysis): AggregatedAnalysis {
  return {
    commitSummary: base.commitSummary,
    keyChanges: overlay.keyChanges.length > 0 ? overlay.keyChanges : base.keyChanges,
    contributors: base.contributors,
    narrative: overlay.narrative || base.narrative,
    rawResponse: overlay.rawResponse,
  };
}

async function analyzeWithAI(repoName: string, branches: string[], commits: CommitRecord[], agents: AgentConfig, prompt: string): Promise<AggregatedAnalysis> {
  const analysisPrompt = buildAnalysisPrompt(repoName, branches, commits, prompt);
  const agentResult = agents.opencode
    ? await analyzeWithOpencode(analysisPrompt, agents.opencode)
    : await analyzeWithGeminiCli(analysisPrompt, agents["gemini-cli"]!);

  const analysis = mergeAnalysis(buildDeterministicAnalysis(commits), parseAiResponse(agentResult.content));
  analysis.rawResponse = agentResult.rawResult;
  analysis.rawResponseSource = agentResult.providerLabel;
  return analysis;
}

function buildMarkdownReport(repoName: string, analysis: AggregatedAnalysis): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const commitSummary = analysis.commitSummary.length > 0 ? analysis.commitSummary.join("\n") : "- No commits found.";
  const keyChanges = analysis.keyChanges.length > 0 ? analysis.keyChanges.join("\n") : "- No key changes found.";
  const contributors = analysis.contributors.length > 0 ? analysis.contributors.join(", ") : "None";
  const narrative = analysis.narrative || "No overall narrative available.";

  return [
    `# ${repoName} - ${dateStamp}`,
    "## Commit Summary",
    commitSummary,
    "## Key Changes",
    keyChanges,
    "## Contributors",
    contributors,
    "## Overall Narrative",
    narrative,
    "",
  ].join("\n");
}

async function generateReport(outputRoot: string, repoName: string, markdown: string): Promise<string> {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const outputDir = join(outputRoot, repoName);
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${dateStamp}-summary.md`);
  await writeFile(outputPath, markdown, "utf8");
  return outputPath;
}

async function writeRawAgentLog(rawOutputRoot: string, repoName: string, rawResponse: string, source: string): Promise<string> {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const outputDir = join(rawOutputRoot, repoName);
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${dateStamp}-agent-raw.log`);
  const payload = [
    `[${new Date().toISOString()}] Raw agent result for ${repoName}`,
    `Source: ${source}`,
    rawResponse,
    "",
  ].join("\n");
  await appendFile(outputPath, payload, "utf8");
  return outputPath;
}

async function logError(errorLogPath: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  const payload = `[${new Date().toISOString()}] ${message}\n\n`;

  try {
    await mkdir(dirname(errorLogPath), { recursive: true });
    await appendFile(errorLogPath, payload, "utf8");
  } catch (logWriteError) {
    const logFailure = logWriteError instanceof Error ? logWriteError.message : String(logWriteError);
    process.stderr.write(`Failed to write error log at ${errorLogPath}: ${logFailure}\n`);
    process.stderr.write(payload);
  }
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage:",
      "  npx ts-node git-ingest.ts [config-path] [--output-root /path/to/reports]",
      "",
      "Defaults:",
      `  config-path: ${DEFAULT_CONFIG_PATH}`,
      `  output-root: ${DEFAULT_OUTPUT_ROOT}`,
      "",
    ].join("\n"),
  );
}

function parseCliArgs(argv: string[]): { configPath?: string; outputRootOverride?: string; showHelp: boolean } {
  const args = [...argv];
  let configPath: string | undefined;
  let outputRootOverride: string | undefined;
  let showHelp = false;

  while (args.length > 0) {
    const current = args.shift();
    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      showHelp = true;
      continue;
    }

    if (current === "--output-root") {
      const nextValue = args.shift();
      if (!nextValue) {
        throw new Error("Missing value for --output-root.");
      }
      outputRootOverride = nextValue;
      continue;
    }

    if (current.startsWith("--")) {
      throw new Error(`Unknown flag: ${current}`);
    }

    if (!configPath) {
      configPath = current;
      continue;
    }

    throw new Error(`Unexpected extra argument: ${current}`);
  }

  return { configPath, outputRootOverride, showHelp };
}

async function processRepo(config: AppConfig, repo: AppConfig["repos"][number]): Promise<{ repoName: string; outputPath: string | null }> {
  const repoPath = resolvePath(repo.path);
  const repoName = repo.repo_name ?? basename(repoPath);

  await ensureRepo(repoPath);
  const commits = await getCommits(repoPath, repo.branches);

  if (commits.length === 0) {
    const markdown = buildMarkdownReport(repoName, buildDeterministicAnalysis([]));
    const outputPath = await generateReport(config.outputRoot, repoName, markdown);
    return { repoName, outputPath };
  }

  let analysis: AggregatedAnalysis;
  try {
    analysis = await analyzeWithAI(repoName, repo.branches, commits, config.agents, config.prompt);
  } catch (error) {
    await logError(config.errorLogPath, error);
    analysis = buildDeterministicAnalysis(commits);
  }

  if (analysis.rawResponse && analysis.rawResponseSource) {
    await writeRawAgentLog(config.rawOutputRoot, repoName, analysis.rawResponse, analysis.rawResponseSource);
  }

  const markdown = buildMarkdownReport(repoName, analysis);
  const outputPath = await generateReport(config.outputRoot, repoName, markdown);
  return { repoName, outputPath };
}

async function run(): Promise<void> {
  const { configPath, outputRootOverride, showHelp } = parseCliArgs(process.argv.slice(2));
  if (showHelp) {
    printUsage();
    return;
  }

  const { config } = await parseConfig(configPath);

  if (outputRootOverride) {
    config.outputRoot = resolvePath(outputRootOverride);
  }

  const failures: Error[] = [];

  for (const repo of config.repos) {
    try {
      const result = await processRepo(config, repo);
      process.stdout.write(`Generated report for ${result.repoName}: ${result.outputPath}\n`);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      failures.push(normalized);
      await logError(config.errorLogPath, normalized);
      process.stderr.write(`Failed to process ${repo.path}: ${normalized.message}\n`);
    }
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

run().catch(async (error) => {
  const normalized = error instanceof Error ? error : new Error(String(error));
  process.stderr.write(`${normalized.stack || normalized.message}\n`);
  process.exitCode = 1;
});
