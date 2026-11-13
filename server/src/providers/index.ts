import { config } from "../config.js";
import { inworldProvider, openrouterProvider } from "./chat.js";
import { geminiProvider } from "./gemini.js";
import { mockProvider } from "./mock.js";
import { openaiProvider } from "./openai.js";
import type { ImageProvider } from "./types.js";

export function getProvider(): ImageProvider {
  switch (config.provider) {
    case "gemini":
      return geminiProvider;
    case "openai":
      return openaiProvider;
    case "openrouter":
      return openrouterProvider;
    case "inworld":
      return inworldProvider;
    default:
      return mockProvider;
  }
}
