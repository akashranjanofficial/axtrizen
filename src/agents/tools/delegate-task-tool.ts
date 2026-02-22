import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import { AGENT_LANE_NESTED } from "../lanes.js";
import { jsonResult, readStringParam } from "./common.js";
import { extractAssistantText, stripToolMessages } from "./sessions-helpers.js";
import { buildAgentToAgentMessageContext, resolvePingPongTurns } from "./sessions-send-helpers.js";
import { runSessionsSendA2AFlow } from "./sessions-send-tool.a2a.js";

const DelegateTaskToolSchema = Type.Object({
  teamName: Type.String({ description: "The name of the Team to delegate the task to." }),
  prompt: Type.String({ description: "The task prompt or sub-task to send to the team." }),
});

/**
 * The `delegate_task` tool allows Manager Agents to natively pass prompts to their assigned Teams.
 * It resolves the Team Name to its corresponding Axtrizen Group Chat Agent, and sends the prompt.
 */
export function createDelegateTaskTool(opts?: { agentSessionKey?: string }): AnyAgentTool {
  return {
    label: "Delegate Task",
    name: "delegate_task",
    description:
      "Delegate a sub-task or prompt to a specific Team of worker agents. You will wait for their final combined reply. Use this to orchestrate multiple teams concurrently.",
    parameters: DelegateTaskToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const teamName = readStringParam(params, "teamName", { required: true });
      const prompt = readStringParam(params, "prompt", { required: true });

      const expectedAgentName = `${teamName.trim()} - Group Chat`.toLowerCase();

      // 1. Fetch all agents to find the Group Chat Agent for this Team
      let groupChatAgentId: string | undefined;
      let displayKey = "";
      try {
        const result = await callGateway<{ agents: Array<{ id: string; name?: string }> }>({
          method: "agents.list",
          params: {},
        });
        const agents = Array.isArray(result?.agents) ? result.agents : [];
        const found = agents.find((a) => a.name?.toLowerCase() === expectedAgentName);
        if (found) {
          groupChatAgentId = found.id;
          displayKey = `Team: ${teamName}`;
        }
      } catch {
        return jsonResult({
          status: "error",
          error: "Failed to list agents to resolve Team.",
        });
      }

      if (!groupChatAgentId) {
        return jsonResult({
          status: "error",
          error: `Team not found. Could not find a Group Chat for team name: "${teamName}". Make sure the Team exists.`,
        });
      }

      // 2. Resolve the main session key for the Group Chat Agent
      const config = loadConfig();
      const resolvedKey = `agent:${groupChatAgentId}:main`;

      const idempotencyKey = crypto.randomUUID();
      let runId: string = idempotencyKey;

      const agentMessageContext = buildAgentToAgentMessageContext({
        requesterSessionKey: opts?.agentSessionKey,
        targetSessionKey: displayKey,
      });

      const sendParams = {
        message: prompt,
        sessionKey: resolvedKey,
        idempotencyKey,
        deliver: false,
        channel: INTERNAL_MESSAGE_CHANNEL,
        lane: AGENT_LANE_NESTED,
        extraSystemPrompt: agentMessageContext,
      };

      try {
        const response = await callGateway<{ runId: string }>({
          method: "agent",
          params: sendParams,
        });
        if (response?.runId) {
          runId = response.runId;
        }
      } catch (err) {
        return jsonResult({
          runId,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const timeoutMs = 120_000; // Allow sub-teams 2 minutes to reply

      let waitStatus: string | undefined;
      let waitError: string | undefined;
      try {
        const wait = await callGateway<{ status?: string; error?: string }>({
          method: "agent.wait",
          params: { runId, timeoutMs },
          timeoutMs: timeoutMs + 2000,
        });
        waitStatus = wait?.status;
        waitError = wait?.error;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return jsonResult({
          runId,
          status: msg.includes("gateway timeout") ? "timeout" : "error",
          error: msg,
        });
      }

      if (waitStatus === "timeout" || waitStatus === "error") {
        return jsonResult({
          runId,
          status: waitStatus,
          error: waitError ?? "agent error",
        });
      }

      // Fetch the last assistant message from the team's history
      const history = await callGateway<{ messages: Array<unknown> }>({
        method: "chat.history",
        params: { sessionKey: resolvedKey, limit: 50 },
      });
      const filtered = stripToolMessages(Array.isArray(history?.messages) ? history.messages : []);
      const last = filtered.length > 0 ? filtered[filtered.length - 1] : undefined;
      const reply = last ? extractAssistantText(last) : undefined;

      // Start the ping-pong flow asynchronously to keep the conversation alive if needed
      void runSessionsSendA2AFlow({
        targetSessionKey: resolvedKey,
        displayKey,
        message: prompt,
        announceTimeoutMs: timeoutMs,
        maxPingPongTurns: resolvePingPongTurns(config),
        requesterSessionKey: opts?.agentSessionKey,
        roundOneReply: reply ?? undefined,
      });

      return jsonResult({
        runId,
        status: "ok",
        reply,
      });
    },
  };
}
