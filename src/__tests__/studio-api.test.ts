import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import {
  fetchStudioAgents,
  fetchStudioAgent,
  createStudioAgent,
  updateStudioAgent,
  deleteStudioAgent,
  fetchStudioPrompts,
  createStudioPromptVersion,
  publishStudioPromptVersion,
  fetchStudioDeployments,
  createStudioDeployment,
  promoteStudioDeployment,
  validateStudioPrompt,
  fetchAllStudioSessions,
  fetchStudioArchetypes,
  cloneStudioAgent,
} from "@/lib/studio-api";

function mockResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function mockNoContent() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 204,
    json: () => Promise.resolve(undefined),
    text: () => Promise.resolve(""),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("Studio API Client", () => {
  describe("Agents", () => {
    it("fetchStudioAgents returns agents list", async () => {
      const agents = [{ id: "alice", display_name: "Alice" }];
      mockResponse(agents);

      const result = await fetchStudioAgents();
      expect(result).toEqual(agents);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/studio/agents",
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it("fetchStudioAgents with filters", async () => {
      mockResponse([]);

      await fetchStudioAgents({ status: "active", domain: "math" });
      expect(mockFetch.mock.calls[0][0]).toContain("status=active");
      expect(mockFetch.mock.calls[0][0]).toContain("domain=math");
    });

    it("fetchStudioAgent returns detail", async () => {
      const agent = { id: "alice", config_sections: {}, prompts: [] };
      mockResponse(agent);

      const result = await fetchStudioAgent("alice");
      expect(result.id).toBe("alice");
    });

    it("createStudioAgent posts data", async () => {
      mockResponse({ id: "new-agent" });

      await createStudioAgent({ id: "new-agent", display_name: "New" });
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/studio/agents",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("updateStudioAgent puts data", async () => {
      mockResponse({ id: "alice", display_name: "Updated" });

      await updateStudioAgent("alice", { display_name: "Updated" });
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/studio/agents/alice",
        expect.objectContaining({ method: "PUT" })
      );
    });

    it("deleteStudioAgent sends DELETE", async () => {
      mockNoContent();

      await deleteStudioAgent("alice");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/studio/agents/alice",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not Found"),
      });

      await expect(fetchStudioAgent("missing")).rejects.toThrow("Studio API error");
    });
  });

  describe("Prompts", () => {
    it("fetchStudioPrompts returns slots", async () => {
      mockResponse([{ slug: "system" }]);

      const result = await fetchStudioPrompts("alice");
      expect(result[0].slug).toBe("system");
    });

    it("createStudioPromptVersion posts content", async () => {
      mockResponse({ id: "v1", version: 1 });

      await createStudioPromptVersion("alice", "system", {
        content: "Hello {{name}}",
        variables: [{ name: "name", type: "string" as const, required: true }],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.content).toBe("Hello {{name}}");
    });

    it("publishStudioPromptVersion sends PATCH", async () => {
      mockResponse({ id: "v1", status: "published" });

      await publishStudioPromptVersion("v1");
      expect(mockFetch.mock.calls[0][1].method).toBe("PATCH");
    });
  });

  describe("Deployments", () => {
    it("fetchStudioDeployments returns list", async () => {
      mockResponse([{ version: 1, status: "live" }]);

      const result = await fetchStudioDeployments("alice");
      expect(result[0].status).toBe("live");
    });

    it("createStudioDeployment posts pins", async () => {
      mockResponse({ version: 2, status: "staging" });

      await createStudioDeployment("alice", {
        prompt_pins: { sys: "v1" },
        change_note: "test",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.prompt_pins.sys).toBe("v1");
    });

    it("promoteStudioDeployment sends PATCH", async () => {
      mockResponse({ status: "live" });

      await promoteStudioDeployment("dep-1");
      expect(mockFetch.mock.calls[0][0]).toContain("/promote");
    });
  });

  describe("Validation", () => {
    it("validateStudioPrompt sends content and context", async () => {
      mockResponse({ resolved: "Hello Alice", errors: [], extracted_variables: ["name"] });

      const result = await validateStudioPrompt("alice", {
        content: "Hello {{name}}",
        context: { name: "Alice" },
      });

      expect(result.resolved).toBe("Hello Alice");
      expect(result.errors).toEqual([]);
    });
  });

  describe("Sessions", () => {
    it("fetchAllStudioSessions returns list", async () => {
      mockResponse([{ id: "s1", agent_id: "alice" }]);

      const result = await fetchAllStudioSessions();
      expect(result[0].agent_id).toBe("alice");
    });
  });

  describe("Archetypes", () => {
    it("fetchStudioArchetypes returns list", async () => {
      mockResponse([{ id: "sat-math-tutor" }]);

      const result = await fetchStudioArchetypes();
      expect(result[0].id).toBe("sat-math-tutor");
    });
  });

  describe("Clone", () => {
    it("cloneStudioAgent posts to clone endpoint", async () => {
      mockResponse({ id: "bill" });

      await cloneStudioAgent("alice", { new_id: "bill", display_name: "Bill" });
      expect(mockFetch.mock.calls[0][0]).toContain("/clone/alice");
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });
  });
});
