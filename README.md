# git-ingest

Generate daily markdown reports from the last 24 hours of git activity across one or more repositories.

## Setup

```bash
npm install
```

## Usage

```bash
npx ts-node git-ingest.ts
```

Optional overrides:

```bash
npx ts-node git-ingest.ts /path/to/config.jsonc --output-root /path/to/reports
```

Default config path:

```text
$HOME/.config/git-ingest/config.jsonc
```

## Config shape

```jsonc
{
  "repos": [
    {
      "path": "/path/to/repo",
      "repo_name": null,
      "branches": ["main"]
    }
  ],
  "output_root": "/Users/tsuzuku/reports",
  "error_log": "error.log",
  "agents": {
    "opencode": {
      "provider": "openai",
      "model": "qwen-max",
      "api_key": null,
      "api_key_env": null
    }
  },
  "prompt": "Summarize repo activity from last 24h."
}
```

If `agents.opencode` is configured, the script will call the local `opencode` CLI with `--model provider/model`. If `agents.gemini-cli` is configured instead, it will call the local `gemini` CLI and pass the rendered prompt via stdin.

`api_key` and `api_key_env` are accepted in config, but `opencode` itself manages provider credentials. In practice, the selected provider usually still needs to be configured in your local `opencode` setup.
