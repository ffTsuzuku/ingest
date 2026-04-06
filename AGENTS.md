Git-Ingest Daily Report Generator - Design Spec
Date: 2026-04-05  
Version: 1.0.0  
Author: tsuzuku
Overview
A TypeScript script that analyzes last 24h of git repository activity using AI to generate daily markdown reports. Integrates with Opencode for AI analysis, supports Gemini CLI as alternative.
Configuration
Location: $HOME/.config/git-ingest/config.jsonc
{
  "repos": [
    {
      "path": "/path/to/repo",
      "repo_name": null, // null = use basename of path
      "branches": ["main", "dev"]
    }
  ],
  "output_root": "/Users/tsuzuku/reports",
  "error_log": "error.log",
  
  "provider": {
    "opencode": {
      "model": "qwen-max",
      "endpoint": "http://localhost:1234/v1/chat/completions",
      "api_key_env": null
    },
    
    "gemini-cli": {
      "model": "gemini-1.5-flash",
      "gemini_api_key_file": "~/.config/gemini-api-key.json"
    }
  },
  
  "prompt": "Summarize repo activity from last 24h: commit messages, authors, key patterns, overall narrative..."
}
Script Structure
Main Entry: git-ingest.ts
├── parseConfig() - Load and validate JSONC config
├── scanRepos()   - Resolve repo paths from config
├── getCommits()  - Fetch commits per branch filtered by 24h window
├── analyzeWithAI() - Call AI for each commit aggregation
├── generateReport() - Build markdown from AI responses
└── run()          - Main orchestration loop
Error Handling
- Errors logged to config location (error.log)
- Pretty-printed stack traces to stderr
- Continue processing other repos on failure
Workflow
For each repository:
1. Resolve output path  
   - Use repo_name from config OR basename of path
   
2. Fetch commits per branch  
   - For each branch in branches array:
     - Run: git log --since="24 hours ago" --format='%H|%an|%ae|%s|%b'
     - Parse commit hash, author, email, subject, body
   
3. AI Analysis per commit  
   - For each commit:
     - Call AI with commit data + prompt template
     - Store response for aggregation
   
4. Aggregate responses  
   - Merge all AI responses into structured format:
          interface AggregatedAnalysis {
       commits: Array<{
         hash: string;
         author: string;
         email: string;
         summary: string;
         filesChanged?: string[];
       }>;
       keyChanges: Array<string>;
       contributors: Set<string>;
       narrative: string;
     }
        
5. Generate markdown report  
   - Sections: Commit Summary, Key Changes, Contributors, Overall Narrative
   - Write to: <output_root>/<repo_name>/YYYY-MM-DD-summary.md
6. Error handling  
   - Catch git errors, AI timeouts, file write failures
   - Log to error.log, continue with next repo
AI Prompt Template (Embedded Default)
You are analyzing git commit activity for a repository report.
Context:
- Time window: Last 24 hours from {timestamp}
- Branches analyzed: {branches}
- Total commits: {count}
For each commit provided, analyze and produce:
## 1. COMMIT SUMMARY (per commit)
For each commit, provide:
- Who: Author name and email
- What: Commit message summary
- Files: List of modified/added/deleted files (top 5 by impact)
Aggregate these into a coherent list.
## 2. KEY CHANGES (aggregate across all commits)
Identify:
- Feature additions: keywords "add", "feat", "feature", "+[A-Z]"
- Bug fixes: keywords "fix", "bug", "hotfix", "regression"  
- Breaking changes: keywords "BREAKING CHANGE", "! ", "!="
List each with brief description.
## 3. CONTRIBUTORS (unique authors)
Extract all unique author names, count their commits.
Sort by contribution count descending.
## 4. OVERALL NARRATIVE (2-4 sentences)
Write a cohesive paragraph summarizing:
- What was the main focus/activity in this repo today?
- Were there major feature additions or critical fixes?
- Any notable patterns or themes?
Output format MUST be exactly:
# <Repo Name> - YYYY-MM-DD
## Commit Summary
<bulleted list of commits with who/what/files>
## Key Changes
<bulleted list categorized by type>
## Contributors
<comma-separated names sorted by contribution count>
## Overall Narrative
<pending paragraph summary>
Output Format Example
# auth-service - 2026-04-05
## Commit Summary
- Who: Alice Johnson <alice@example.com>
  What: Add user authentication flow with OAuth2 support
  Files: src/auth/oauth.ts (+120), src/auth/index.ts (+85), tests/auth.test.ts (+200)
- Who: Bob Smith <bob@example.com>
  What: Fix token refresh bug causing 401 errors in production
  Files: src/auth/tokenRefresh.ts (-15, +22), src/middleware/auth.middleware.ts (+30)
## Key Changes
**Feature Additions:**
- Added OAuth2 authentication flow with full token management
**Bug Fixes:**
- Fixed token refresh logic that was failing with 401 errors in production environment
## Contributors
Alice Johnson, Bob Smith
## Overall Narrative
The auth-service repository saw significant development focused on implementing OAuth2 authentication and fixing a critical production bug related to token refresh failures. Two main contributors worked on the repository today, with Alice adding the new OAuth2 flow and Bob resolving an urgent token refresh issue.
Installation & Usage
No installation needed - just run:
cd /Users/tsuzuku/git-ingest
npx ts-node git-ingest.ts config.jsonc --output-root /path/to/reports
Or with full path in config (default):
npx ts-node git-ingest.ts $HOME/.config/git-ingest/config.jsonc
Cron Integration
Example cron entry to run at midnight:
0 0 * * * cd /Users/tsuzuku && npx ts-node git-ingest.ts $HOME/.config/git-ingest/config.jsonc >> /tmp/git-ingest-cron.log 2>&1
Edge Cases & Error Scenarios
Scenario
Repo with no commits in 24h
Git command fails (permissions, etc.)
AI timeout/failed
Output folder doesn't exist
Invalid config field
Dependencies
{
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
No external runtime dependencies (uses native Node.js fs and child_process).
---
Implementation Checklist
- [ ] Parse JSONC config with defaults
- [ ] Resolve repo paths from config array
- [ ] Git commit fetching per branch with 24h filter
- [ ] Opencode AI tool integration for analysis calls
- [ ] Report markdown generation
- [ ] Error logging (file + stderr)
- [ ] Output folder auto-creation
- [ ] Cron compatibility testing
---
