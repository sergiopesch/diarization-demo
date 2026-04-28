import http from "node:http";

const port = getPort();

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { status: "ok", mock: true });
    return;
  }

  if (req.method === "POST" && req.url === "/transcribe") {
    readBody(req)
      .then((body) => {
        let payload = {};

        try {
          payload = JSON.parse(body);
        } catch {
          sendJson(res, 400, { detail: "Invalid JSON" });
          return;
        }

        if (!payload.audioContent) {
          sendJson(res, 400, { detail: "No audioContent provided" });
          return;
        }

        sendJson(res, 200, {
          transcriptionData: [
            { word: "mock", speaker: 1, startSeconds: 0, endSeconds: 0.4 },
            { word: "transcript", speaker: 2, startSeconds: 0.5, endSeconds: 1 },
          ],
          model: payload.model ?? "mock-model",
        });
      })
      .catch(() => {
        sendJson(res, 500, { detail: "Mock worker failed" });
      });
    return;
  }

  sendJson(res, 404, { detail: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock local worker listening on http://127.0.0.1:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

function getPort() {
  const portFlagIndex = process.argv.indexOf("--port");
  const portValue =
    portFlagIndex === -1 ? process.env.E2E_WORKER_PORT : process.argv[portFlagIndex + 1];
  const parsedPort = Number(portValue);

  return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 18000;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
