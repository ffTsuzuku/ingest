# Extension & Contribution Guide

This guide explains how to extend `ingest` with new AI providers, custom report formats, TUI screens, and scheduler engines.

## 1. Adding a New AI Provider

All AI providers implement the `AIProvider` interface located in [`src/ai/types.ts`](file:///Users/tsuzuku/Git/ingest/main/src/ai/types.ts).

### Step 1: Implement the `AIProvider` Interface
Create a new file under `src/ai/<provider-name>.ts`:

```typescript
import type { AIProvider, AnalysisContext, AnalysisResult } from "./types.js";

export class CustomProvider implements AIProvider {
  public readonly id = "custom-provider";
  public readonly name = "Custom AI Engine";

  constructor(private readonly config: { endpoint?: string; apiKey?: string; model: string }) {}

  async isAvailable(): Promise<boolean> {
    // Check if CLI tool is installed or credentials exist
    return true;
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    // Execute analysis call
    return {
      content: "# Report output...",
      providerLabel: `${this.name} (${this.config.model})`,
      rawResult: "{...}",
    };
  }
}
```

### Step 2: Register Provider in `src/ai/factory.ts`
Update `getProvider()` in [`src/ai/factory.ts`](file:///Users/tsuzuku/Git/ingest/main/src/ai/factory.ts) to instantiate your provider when selected in config.

---

## 2. Adding a New TUI Menu Option

Interactive screens are managed in [`src/tui/menu.ts`](file:///Users/tsuzuku/Git/ingest/main/src/tui/menu.ts).

1. Add your new action handler to `menu.ts`:
   ```typescript
   async function handleCustomAction(ctx: MenuContext): Promise<void> {
     const answer = await promptText({
       message: "Enter custom parameter:",
     });
     // Execute logic...
   }
   ```
2. Add the option to `renderMainMenu()` with an emoji icon and description.

---

## 3. Extending the Scheduler

Schedulers implement the `SchedulerService` interface in [`src/scheduler/types.ts`](file:///Users/tsuzuku/Git/ingest/main/src/scheduler/types.ts).

To support a new daemon system (e.g. `systemd` user timers):
1. Create `src/scheduler/systemd.ts`.
2. Implement `install()`, `uninstall()`, `status()`, and `list()`.
3. Register the service in the TUI scheduler wizard.
