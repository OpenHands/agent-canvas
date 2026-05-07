#!/usr/bin/env node
/**
 * Simple local telemetry development server.
 * 
 * This server receives telemetry events sent to localhost:8080 and logs them
 * to the console. Use this for testing and development of the telemetry feature.
 * 
 * Usage:
 *   node scripts/telemetry-dev-server.mjs
 * 
 * Or add to package.json scripts and run:
 *   npm run telemetry:dev
 */

import http from "http";

const PORT = 8080;

const server = http.createServer((req, res) => {
  // Enable CORS for local development
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only handle POST to /capture
  if (req.method !== "POST" || req.url !== "/capture") {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const event = JSON.parse(body);
      
      // Pretty print the event
      console.log("\n" + "=".repeat(60));
      console.log(`📊 Telemetry Event Received at ${new Date().toISOString()}`);
      console.log("=".repeat(60));
      console.log(`Event: ${event.event}`);
      console.log(`Distinct ID: ${event.distinct_id}`);
      console.log(`Timestamp: ${event.timestamp || "N/A"}`);
      console.log("\nProperties:");
      console.log(JSON.stringify(event.properties, null, 2));
      console.log("=".repeat(60));
      
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    } catch {
      console.error("Failed to parse event:", body);
      res.writeHead(400);
      res.end("Invalid JSON");
    }
  });
});

server.listen(PORT, () => {
  console.log(`
🔭 Telemetry Development Server
================================
Listening on http://localhost:${PORT}/capture

This server will log all telemetry events received from the
@openhands/agent-canvas library. Events are printed to the
console in a readable format.

To test:
1. Start your frontend app with telemetry enabled
2. Grant telemetry consent in the app
3. Watch events appear here

Press Ctrl+C to stop.
`);
});
