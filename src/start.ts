import { app } from "./server.js";
import { config } from "./config.js";

app.listen({ host: config.host, port: config.port }).catch(error => {
  app.log.error(error);
  process.exit(1);
});
