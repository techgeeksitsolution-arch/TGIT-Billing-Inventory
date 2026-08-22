import { app } from "./app.js";
import { env } from "./config.js";

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  process.exit(1);
});

const server = app.listen(env.BACKEND_PORT, () => {
  console.log(`TGIT backend listening on http://localhost:${env.BACKEND_PORT}`);
});

server.on("error", (err) => {
  console.error("SERVER ERROR:", err);
});
