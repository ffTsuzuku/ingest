/**
 * Multi-format report exporter.
 * Converts generated Markdown reports to JSON, HTML, or Slack mrkdwn format.
 */

import type { ReportMeta } from "./types.js";

export type OutputFormat = "markdown" | "json" | "html" | "slack";

export interface FormattedReport {
  content: string;
  format: OutputFormat;
  fileExtension: string;
}

/**
 * Convert a markdown report to JSON format containing structured metadata and raw content.
 */
export function toJson(markdown: string, meta: ReportMeta): FormattedReport {
  const jsonObj = {
    meta: {
      repoName: meta.repoName,
      branch: meta.branch,
      branches: meta.branches,
      dateStr: meta.dateStr,
      generatedAt: meta.generatedAt,
      provider: meta.providerLabel,
      commitCount: meta.commitCount,
      reportStyle: meta.reportStyle,
      tokenUsage: meta.tokenUsage,
    },
    content: markdown,
  };

  return {
    content: JSON.stringify(jsonObj, null, 2),
    format: "json",
    fileExtension: ".json",
  };
}

/**
 * Convert a markdown report to a self-contained HTML document.
 * Uses a simple embedded stylesheet for readability.
 */
export function toHtml(markdown: string, meta: ReportMeta): FormattedReport {
  const title = `${meta.repoName} - ${meta.dateStr}`;
  
  // Simple markdown-to-HTML conversion (no external dependencies)
  let htmlBody = escapeHtml(markdown)
    // Headers
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Unordered lists
    .replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines to <br>
    .replace(/\n/g, '<br>\n');

  // Wrap loose <li> elements in <ul>
  htmlBody = htmlBody.replace(/(<li>.*?<\/li>(?:\s*<br>\n)?)+/g, (match) => {
    return '<ul>' + match.replace(/<br>\n/g, '') + '</ul>';
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #24292e; }
    h1 { border-bottom: 2px solid #e1e4e8; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #e1e4e8; padding-bottom: 0.2em; }
    code { background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-size: 85%; }
    pre { background: #f6f8fa; padding: 1em; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    hr { border: none; border-top: 1px solid #e1e4e8; margin: 2em 0; }
    li { margin: 0.25em 0; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .meta { color: #586069; font-size: 0.85em; font-style: italic; }
  </style>
</head>
<body>
  <p>${htmlBody}</p>
  <div class="meta">
    <p>Report: ${escapeHtml(meta.repoName)} | ${escapeHtml(meta.dateStr)} | Provider: ${escapeHtml(meta.providerLabel)} | Commits: ${meta.commitCount}</p>
  </div>
</body>
</html>`;

  return {
    content: html,
    format: "html",
    fileExtension: ".html",
  };
}

/**
 * Convert a markdown report to Slack mrkdwn format.
 * Slack uses its own subset of markdown-like formatting.
 */
export function toSlack(markdown: string, _meta: ReportMeta): FormattedReport {
  let slack = markdown
    // Headers: Slack uses *bold* for emphasis
    .replace(/^######\s+(.+)$/gm, '*$1*')
    .replace(/^#####\s+(.+)$/gm, '*$1*')
    .replace(/^####\s+(.+)$/gm, '*$1*')
    .replace(/^###\s+(.+)$/gm, '*$1*')
    .replace(/^##\s+(.+)$/gm, '\n*$1*')
    .replace(/^#\s+(.+)$/gm, '\n*$1*')
    // Bold: **text** -> *text*
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    // Italic: single *text* stays same in Slack (actually it becomes bold, so use _text_)
    // Links: [text](url) -> <url|text>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
    // Horizontal rules
    .replace(/^---$/gm, '───────────────────');

  return {
    content: slack,
    format: "slack",
    fileExtension: ".txt",
  };
}

/**
 * Convert a report to the specified output format.
 */
export function formatReport(markdown: string, meta: ReportMeta, format: OutputFormat): FormattedReport {
  switch (format) {
    case "json":
      return toJson(markdown, meta);
    case "html":
      return toHtml(markdown, meta);
    case "slack":
      return toSlack(markdown, meta);
    case "markdown":
    default:
      return { content: markdown, format: "markdown", fileExtension: ".md" };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
