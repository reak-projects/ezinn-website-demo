import { createDemoRequestHandler } from "../server/demo-request.js";

export function createVercelDemoRequestHandler(options) {
  return createDemoRequestHandler(options);
}

export default createVercelDemoRequestHandler();
