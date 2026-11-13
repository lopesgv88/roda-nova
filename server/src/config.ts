import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_SECRET = "dev-secret-change-me";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? DEFAULT_SECRET,
  provider: (process.env.IMAGE_PROVIDER ?? "mock") as "mock" | "gemini" | "openai" | "openrouter" | "inworld",
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
  uploadsDir: path.resolve(process.env.DATA_DIR ?? "data", "uploads"),
  production: process.env.NODE_ENV === "production",
};

/** Em produção o servidor se recusa a subir com configuração insegura. */
export function assertSafeConfig() {
  if (!config.production) return;
  if (config.jwtSecret === DEFAULT_SECRET || config.jwtSecret.length < 32)
    throw new Error("Defina JWT_SECRET com pelo menos 32 caracteres aleatórios em produção.");
  if (process.env.PLANS_UNLOCK_FOR_TESTING === "true")
    throw new Error("PLANS_UNLOCK_FOR_TESTING=true não pode ser usado em produção (libera planos sem pagar).");
  if (config.provider === "mock") throw new Error("IMAGE_PROVIDER=mock não pode ser usado em produção.");
}

mkdirSync(config.uploadsDir, { recursive: true });
