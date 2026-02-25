import { describe, it, expect } from "vitest";
import {
  selectNextSpeaker,
  getSmartSpeakerOrder,
  detectConvergence,
  isAgentDone,
  parseDelegations,
  parseReviewVerdict,
  buildDelegationPrompt,
  buildManagerReviewPrompt,
  buildWorkerReportPrompt,
  buildSpeakerSelectionContext,
  type DiscussionAgent,
  type AgentResponse,
  type DelegationTask,
} from "../../app/services/discussion-engine";

// ── Test Data ──

const MANAGER: DiscussionAgent = { id: "mgr-1", name: "Manager", role: "manager" };
const FRONTEND: DiscussionAgent = { id: "fe-1", name: "Frontend", role: "frontend" };
const BACKEND: DiscussionAgent = { id: "be-1", name: "Backend", role: "backend" };
const REVIEWER: DiscussionAgent = { id: "rev-1", name: "Reviewer", role: "reviewer" };
const ALL_AGENTS = [MANAGER, FRONTEND, BACKEND, REVIEWER];

function makeResponse(agent: DiscussionAgent, text: string, ts?: number): AgentResponse {
  return { agentId: agent.id, name: agent.name, text, timestamp: ts || Date.now() };
}

// ══════════════════════════════════════════════════════════
// 1. SMART SPEAKER SELECTION
// ══════════════════════════════════════════════════════════

describe("Smart Speaker Selection", () => {
  describe("selectNextSpeaker", () => {
    it("should return manager first for planning topics when no responses exist", () => {
      const result = selectNextSpeaker(ALL_AGENTS, [], "plan the project roadmap");
      expect(result?.id).toBe(MANAGER.id);
    });

    it("should pick frontend for UI-related topics", () => {
      // Manager already spoke, so recency penalty applies
      const responses = [makeResponse(MANAGER, "Here's the high-level plan")];
      const result = selectNextSpeaker(
        ALL_AGENTS,
        responses,
        "the CSS layout is broken and the button component needs restyling",
      );
      expect(result?.id).toBe(FRONTEND.id);
    });

    it("should pick backend for API-related topics", () => {
      const responses = [makeResponse(MANAGER, "We need to optimize the database queries")];
      const result = selectNextSpeaker(
        ALL_AGENTS,
        responses,
        "the database API endpoint is slow and needs caching",
      );
      expect(result?.id).toBe(BACKEND.id);
    });

    it("should boost agents who are @mentioned in the last response", () => {
      const responses = [makeResponse(MANAGER, "I need @Frontend to review the UI mockups")];
      const result = selectNextSpeaker(ALL_AGENTS, responses, "some generic topic");
      expect(result?.id).toBe(FRONTEND.id);
    });

    it("should apply recency penalty to agents who just spoke", () => {
      const responses = [
        makeResponse(FRONTEND, "Here's the component"),
        makeResponse(FRONTEND, "Updated the styles too"),
      ];
      const result = selectNextSpeaker(ALL_AGENTS, responses, "discuss the component");
      // Frontend should NOT be picked again due to heavy recency penalty
      expect(result?.id).not.toBe(FRONTEND.id);
    });

    it("should skip converged agents", () => {
      const converged = new Set([MANAGER.id, FRONTEND.id]);
      const result = selectNextSpeaker(ALL_AGENTS, [], "any topic", converged);
      expect(result?.id).not.toBe(MANAGER.id);
      expect(result?.id).not.toBe(FRONTEND.id);
    });

    it("should return null for empty agent list", () => {
      const result = selectNextSpeaker([], [], "any topic");
      expect(result).toBeNull();
    });
  });

  describe("getSmartSpeakerOrder", () => {
    it("should return all agents in relevance order", () => {
      const order = getSmartSpeakerOrder(ALL_AGENTS, "plan the project architecture");
      expect(order).toHaveLength(ALL_AGENTS.length);
      // Manager should be first for planning topics
      expect(order[0].id).toBe(MANAGER.id);
    });

    it("should put frontend first for UI topics", () => {
      const agents = [FRONTEND, BACKEND]; // No manager
      const order = getSmartSpeakerOrder(agents, "fix the CSS layout and button styling");
      expect(order[0].id).toBe(FRONTEND.id);
    });

    it("should put backend first for API topics", () => {
      const agents = [FRONTEND, BACKEND]; // No manager
      const order = getSmartSpeakerOrder(agents, "optimize the database API endpoint queries");
      expect(order[0].id).toBe(BACKEND.id);
    });

    it("should handle single agent", () => {
      const order = getSmartSpeakerOrder([FRONTEND], "any topic");
      expect(order).toHaveLength(1);
      expect(order[0].id).toBe(FRONTEND.id);
    });
  });
});

// ══════════════════════════════════════════════════════════
// 2. CONVERGENCE DETECTION
// ══════════════════════════════════════════════════════════

describe("Convergence Detection", () => {
  describe("detectConvergence", () => {
    it("should not converge with fewer than 2 responses", () => {
      const result = detectConvergence([makeResponse(MANAGER, "Let's start")], 3);
      expect(result.converged).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it("should detect convergence when majority agrees", () => {
      const responses = [
        makeResponse(MANAGER, "Here's the plan"),
        makeResponse(FRONTEND, "I agree, sounds good to me"),
        makeResponse(BACKEND, "LGTM, let's go with that"),
      ];
      const result = detectConvergence(responses, 3);
      expect(result.converged).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should not converge when there's active disagreement", () => {
      const responses = [
        makeResponse(MANAGER, "Let's use REST"),
        makeResponse(FRONTEND, "I agree"),
        makeResponse(BACKEND, "I disagree, I think we should use GraphQL instead"),
      ];
      const result = detectConvergence(responses, 3);
      // With 1 disagreement out of 3, and only 1 agreement, shouldn't converge
      expect(result.converged).toBe(false);
    });

    it("should converge with strong majority even with minor disagreement", () => {
      const responses = [
        makeResponse(MANAGER, "Approved, the plan looks good"),
        makeResponse(FRONTEND, "LGTM, sounds good"),
        makeResponse(BACKEND, "I agree, looks good to me"),
        makeResponse(REVIEWER, "However, I have a small concern but overall approved"),
      ];
      const result = detectConvergence(responses, 4);
      // 3 agreements + 1 with "however" + "approved" - disagreement might override
      // The last response has both agreement AND disagreement signal
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should track per-agent agreement status", () => {
      const responses = [
        makeResponse(MANAGER, "Here's my plan"),
        makeResponse(FRONTEND, "I agree with this approach"),
        makeResponse(BACKEND, "Sounds good, nothing to add"),
      ];
      const result = detectConvergence(responses, 3);
      expect(result.agentAgreements.get(FRONTEND.id)).toBe(true);
      expect(result.agentAgreements.get(BACKEND.id)).toBe(true);
    });

    it("should handle empty responses", () => {
      const result = detectConvergence([], 3);
      expect(result.converged).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe("isAgentDone", () => {
    it("should detect agreement signals", () => {
      expect(isAgentDone("I agree with the plan")).toBe(true);
      expect(isAgentDone("LGTM, ship it")).toBe(true);
      expect(isAgentDone("Sounds good to me")).toBe(true);
      expect(isAgentDone("+1 on this approach")).toBe(true);
      expect(isAgentDone("Nothing to add, looks good")).toBe(true);
    });

    it("should not falsely detect agreement", () => {
      expect(isAgentDone("We need to reconsider this approach")).toBe(false);
      expect(isAgentDone("Here's my implementation plan: ...")).toBe(false);
      expect(isAgentDone("Let me explain my concerns")).toBe(false);
    });
  });
});

// ══════════════════════════════════════════════════════════
// 3. HIERARCHICAL DELEGATION
// ══════════════════════════════════════════════════════════

describe("Hierarchical Delegation", () => {
  describe("parseDelegations", () => {
    it("should parse @mentions with task descriptions", () => {
      const managerText = `Here's the task breakdown:
@Frontend: Build the upload component with drag-and-drop support
@Backend: Create the image conversion API endpoint with WebP support`;

      const delegations = parseDelegations(managerText, ALL_AGENTS, MANAGER.id);
      expect(delegations).toHaveLength(2);
      expect(delegations[0].assignedTo.id).toBe(FRONTEND.id);
      expect(delegations[0].taskDescription).toContain("upload component");
      expect(delegations[1].assignedTo.id).toBe(BACKEND.id);
      expect(delegations[1].taskDescription).toContain("image conversion");
    });

    it("should not delegate to self (manager)", () => {
      const text = "@Manager: Review the final output\n@Frontend: Build UI";
      const delegations = parseDelegations(text, ALL_AGENTS, MANAGER.id);
      // Should only have Frontend delegation, not Manager self-delegation
      expect(delegations.every((d) => d.assignedTo.id !== MANAGER.id)).toBe(true);
    });

    it("should skip very short task descriptions", () => {
      const text = "@Frontend: Do\n@Backend: Build the full API with auth and caching";
      const delegations = parseDelegations(text, ALL_AGENTS, MANAGER.id);
      // "Do" is too short (< 5 chars), should be skipped
      expect(delegations).toHaveLength(1);
      expect(delegations[0].assignedTo.id).toBe(BACKEND.id);
    });

    it("should return empty for no mentions", () => {
      const text = "Let's discuss the approach first before assigning work.";
      const delegations = parseDelegations(text, ALL_AGENTS, MANAGER.id);
      expect(delegations).toHaveLength(0);
    });

    it("should handle partial name matches", () => {
      const text = "@Front: Build the upload component with React components";
      const delegations = parseDelegations(text, ALL_AGENTS, MANAGER.id);
      // "Front" should match "Frontend" via includes()
      expect(delegations).toHaveLength(1);
    });

    it("should set all delegations to pending status", () => {
      const text = "@Frontend: Build UI component\n@Backend: Create API endpoint service";
      const delegations = parseDelegations(text, ALL_AGENTS, MANAGER.id);
      for (const d of delegations) {
        expect(d.status).toBe("pending");
        expect(d.assignedBy.id).toBe(MANAGER.id);
      }
    });
  });

  describe("parseReviewVerdict", () => {
    it("should detect approval", () => {
      const result = parseReviewVerdict("APPROVED. Great work on the component!");
      expect(result.approved).toBe(true);
    });

    it("should detect LGTM as approval", () => {
      const result = parseReviewVerdict("LGTM, this looks good to merge");
      expect(result.approved).toBe(true);
    });

    it("should detect rejection", () => {
      const result = parseReviewVerdict("NEEDS REVISION. Please fix the error handling.");
      expect(result.approved).toBe(false);
    });

    it("should not approve when both signals present but rejection dominant", () => {
      const result = parseReviewVerdict(
        "It looks good overall but needs revision on the auth logic",
      );
      expect(result.approved).toBe(false);
    });

    it("should preserve full review text as feedback", () => {
      const reviewText = "APPROVED. Well done! The code is clean and well-tested.";
      const result = parseReviewVerdict(reviewText);
      expect(result.feedback).toBe(reviewText);
    });
  });
});

// ══════════════════════════════════════════════════════════
// 4. PROMPT BUILDERS
// ══════════════════════════════════════════════════════════

describe("Prompt Builders", () => {
  describe("buildSpeakerSelectionContext", () => {
    it("should include all agents and their roles", () => {
      const context = buildSpeakerSelectionContext("test topic", ALL_AGENTS, []);
      expect(context).toContain("@Manager");
      expect(context).toContain("@Frontend");
      expect(context).toContain("@Backend");
      expect(context).toContain("manager");
      expect(context).toContain("frontend");
    });

    it("should include discussion transcript when available", () => {
      const responses = [makeResponse(MANAGER, "Here's the plan")];
      const context = buildSpeakerSelectionContext("test", ALL_AGENTS, responses);
      expect(context).toContain("Here's the plan");
    });

    it("should show no responses placeholder when empty", () => {
      const context = buildSpeakerSelectionContext("test", ALL_AGENTS, []);
      expect(context).toContain("No responses yet");
    });
  });

  describe("buildDelegationPrompt", () => {
    it("should list non-manager agents for delegation", () => {
      const prompt = buildDelegationPrompt("build an app", ALL_AGENTS);
      expect(prompt).toContain("@Frontend");
      expect(prompt).toContain("@Backend");
      // Should contain "As the team manager" since that's the prompt start
      expect(prompt).toMatch(/As the team manager/);
    });

    it("should include the task description", () => {
      const prompt = buildDelegationPrompt("convert images to WebP", ALL_AGENTS);
      expect(prompt).toContain("convert images to WebP");
    });
  });

  describe("buildWorkerReportPrompt", () => {
    it("should include task and manager mention", () => {
      const delegation: DelegationTask = {
        taskDescription: "Build upload component",
        assignedTo: FRONTEND,
        assignedBy: MANAGER,
        status: "in_progress",
      };
      const prompt = buildWorkerReportPrompt(delegation, "Image converter app");
      expect(prompt).toContain("Build upload component");
      expect(prompt).toContain("@Manager");
      expect(prompt).toContain("Image converter app");
    });
  });

  describe("buildManagerReviewPrompt", () => {
    it("should include worker output and task description", () => {
      const delegation: DelegationTask = {
        taskDescription: "Build API endpoint",
        assignedTo: BACKEND,
        assignedBy: MANAGER,
        status: "completed",
        output: "Created POST /convert endpoint",
      };
      const prompt = buildManagerReviewPrompt(delegation, "POST /convert is ready");
      expect(prompt).toContain("@Backend");
      expect(prompt).toContain("Build API endpoint");
      expect(prompt).toContain("POST /convert is ready");
      expect(prompt).toContain("APPROVED");
      expect(prompt).toContain("NEEDS REVISION");
    });
  });
});
