import { app } from "./server.js";
import { config } from "./config.js";
import { configureSessionStore } from "./auth/session.js";
import { createNeonSessionStore } from "./db/repositories.js";

configureSessionStore(createNeonSessionStore());

app.listen({ host: config.host, port: config.port }).catch(error => {
  app.log.error(error);
  process.exit(1);
});
