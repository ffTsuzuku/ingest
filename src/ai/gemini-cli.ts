import { AntigravityProvider } from "./antigravity.js";
import type { AntigravityProviderConfig } from "../config/types.js";

// Backward-compatibility alias: GeminiCliProvider -> AntigravityProvider
export class GeminiCliProvider extends AntigravityProvider {
  constructor(config: AntigravityProviderConfig = {}) {
    super(config);
  }
}
