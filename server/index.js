import { createServer } from "node:http";
import process from "node:process";
import { createDemoRequestHandler } from "./demo-request.js";

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const server = createServer(createDemoRequestHandler());
server.listen(port, () => {
  console.log(`EZinn demo email API listening on port ${port}`);
});
