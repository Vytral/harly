import net from "node:net";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.HARLY_E2E_SMTP_PORT ?? "2525");
const capturePath =
  process.env.HARLY_E2E_SMTP_CAPTURE ?? "/tmp/harly-e2e-smtp-capture.eml";

mkdirSync(path.dirname(capturePath), { recursive: true });
writeFileSync(capturePath, "", "utf8");

const server = net.createServer((socket) => {
  socket.setEncoding("utf8");
  socket.write("220 harly-e2e.local ESMTP ready\r\n");

  let buffer = "";
  let inData = false;

  function reply(message) {
    socket.write(`${message}\r\n`);
  }

  function consume() {
    if (inData) {
      const end = buffer.indexOf("\r\n.\r\n");
      if (end < 0) return;
      const message = buffer.slice(0, end);
      appendFileSync(
        capturePath,
        `\n---HARLY_E2E_MESSAGE---\n${message}\n`,
        "utf8",
      );
      buffer = buffer.slice(end + "\r\n.\r\n".length);
      inData = false;
      reply("250 2.0.0 queued");
      consume();
      return;
    }

    const lineEnd = buffer.indexOf("\r\n");
    if (lineEnd < 0) return;
    const line = buffer.slice(0, lineEnd);
    buffer = buffer.slice(lineEnd + 2);
    const command = line.trim().toUpperCase();

    if (command.startsWith("EHLO") || command.startsWith("HELO")) {
      socket.write("250-harly-e2e.local\r\n250 SIZE 10485760\r\n");
    } else if (command.startsWith("MAIL FROM:")) {
      reply("250 2.1.0 sender ok");
    } else if (command.startsWith("RCPT TO:")) {
      reply("250 2.1.5 recipient ok");
    } else if (command === "DATA") {
      inData = true;
      reply("354 End data with <CR><LF>.<CR><LF>");
    } else if (command === "RSET") {
      reply("250 2.0.0 reset");
    } else if (command === "NOOP") {
      reply("250 2.0.0 ok");
    } else if (command === "QUIT") {
      reply("221 2.0.0 closing connection");
      socket.end();
    } else {
      reply("250 2.0.0 ok");
    }

    if (buffer.length > 0 && !socket.destroyed) consume();
  }

  socket.on("data", (chunk) => {
    buffer += chunk;
    consume();
  });
  socket.on("error", () => undefined);
});

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Harly E2E SMTP capture listening on 127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
