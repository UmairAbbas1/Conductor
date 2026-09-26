/**
 * conductor_preflight: a stdio MCP tool so any agent can ask Conductor before it touches a buyer.
 * Run: node mcp/conductor.ts (the Conductor app must be running; CONDUCTOR_URL defaults to localhost:3000).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.CONDUCTOR_URL ?? "http://localhost:3000";

const server = new McpServer({ name: "conductor", version: "0.1.0" });

server.registerTool(
  "conductor_preflight",
  {
    title: "Conductor preflight",
    description:
      "Ask Conductor before contacting a buyer. Returns a Decision: allow | hold | delay | reroute | escalate, with the reason, evidence, and who should act instead. Respect anything other than allow.",
    inputSchema: {
      contactId: z.string().describe("graph8 contact id (or demo key such as 'sarah')"),
      action: z.enum(["enroll", "send"]).describe("enroll into a sequence, or send one touch"),
      channel: z.enum(["email", "sms", "linkedin", "call", "voice_agent", "newsletter", "meeting"]).default("email"),
      source: z.enum(["sequence", "campaign", "agent", "dialer", "human", "booking"]).default("agent"),
      senderId: z.string().describe("who is about to send, e.g. 'nova', 'bilal', 'ali'"),
      sequenceId: z.string().optional(),
      snippet: z.string().optional().describe("the message about to be sent"),
    },
  },
  async ({ contactId, action, ...payload }) => {
    try {
      const res = await fetch(`${BASE}/api/preflight`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, action, payload }),
      });
      const decision = await res.json();
      const line = `${String(decision.decision).toUpperCase()} (${decision.rule}): ${decision.reason}`;
      return { content: [{ type: "text", text: `${line}\n\n${JSON.stringify(decision, null, 2)}` }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Conductor unreachable at ${BASE}: ${(e as Error).message}` }] };
    }
  },
);

await server.connect(new StdioServerTransport());
