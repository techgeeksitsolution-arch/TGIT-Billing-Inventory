import { app } from "./app.js";
import { env } from "./config.js";

// An uncaught exception leaves the process in an undefined state, so exiting is
// correct. A rejected promise does not, and killing the server for one made the
// backend silently disappear mid-session, after which the dev proxy answered
// every /api call with an empty body.
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION (server kept alive):", reason);
});

const server = app.listen(env.BACKEND_PORT, () => {
  console.log(`TGIT backend listening on http://localhost:${env.BACKEND_PORT}`);
});

server.on("error", (err) => {
  console.error("SERVER ERROR:", err);
});
