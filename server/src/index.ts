import { buildApp } from "./app.js";
import { assertSafeConfig, config } from "./config.js";

assertSafeConfig();
const app = await buildApp();
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`WheelAI server em http://0.0.0.0:${config.port} (provedor: ${config.provider})`);
