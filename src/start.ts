import { app } from "./server.js";
import { config } from "./config.js";
import { configureSessionStore } from "./auth/session.js";
import { createNeonSessionStore } from "./db/repositories.js";

configureSessionStore(createNeonSessionStore());

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down Forge");
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

app.listen({ host: config.host, port: config.port }).catch(error => {
  app.log.error(error);
  process.exit(1);
});
