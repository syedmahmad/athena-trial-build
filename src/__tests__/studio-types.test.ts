import { describe, it, expect } from "vitest";
import type {
  StudioAgent,
  StudioAgentDetail,
  StudioPromptVersion,
  StudioDeployment,
  StudioSessionSummary,
  ArchetypePromptSection,
  ArchetypeConfigParam,
  ModelSettings,
  UISettings,
  InteractionRules,
  PromptVariable,
} from "@/types/studio";

describe("Studio Types", () => {
  it("StudioAgent has required fields", () => {
    const agent: StudioAgent = {
      id: "alice",
      display_name: "Alice",
      tagline: "Patient tutor",
      description: null,
      icon_url: null,
      avatar_color: "#a371f7",
      domain: "math",
      status: "active",
      sort_order: 1,
      archetype_id: null,
      agent_config: {},
      cloned_from: null,
      created_at: "2026-04-20T00:00:00Z",
      updated_at: "2026-04-20T00:00:00Z",
    };
    expect(agent.id).toBe("alice");
    expect(agent.status).toBe("active");
  });

  it("StudioAgentDetail extends Agent with config and prompts", () => {
    const detail: StudioAgentDetail = {
      id: "alice",
      display_name: "Alice",
      tagline: null,
      description: null,
      icon_url: null,
      avatar_color: "#58a6ff",
      domain: "math",
      status: "active",
      sort_order: 0,
      archetype_id: null,
      agent_config: {},
      cloned_from: null,
      created_at: "",
      updated_at: "",
      config_sections: {
        model_settings: { provider: "anthropic", model: "claude-sonnet-4-5-20250929", max_tokens: 2000, temperature: 0.7 },
      },
      prompts: [],
    };
    expect(detail.config_sections.model_settings?.provider).toBe("anthropic");
  });

  it("PromptVariable has correct shape", () => {
    const v: PromptVariable = {
      name: "skill_name",
      type: "string",
      required: true,
      description: "The skill being taught",
    };
    expect(v.name).toBe("skill_name");
    expect(v.required).toBe(true);
  });

  it("StudioPromptVersion tracks status", () => {
    const v: StudioPromptVersion = {
      id: "v1",
      prompt_id: "p1",
      version: 1,
      content: "Hello {{name}}",
      variables: [{ name: "name", type: "string", required: true }],
      status: "published",
      author: "admin",
      change_note: "initial",
      created_at: "",
    };
    expect(v.status).toBe("published");
    expect(v.variables[0].name).toBe("name");
  });

  it("StudioDeployment has prompt pins", () => {
    const d: StudioDeployment = {
      id: "d1",
      agent_id: "alice",
      version: 1,
      status: "live",
      prompt_pins: { "prompt-uuid": "version-uuid" },
      config_snapshot: { model: { model: "claude-sonnet" } },
      change_note: "first deploy",
      deployed_by: "admin",
      created_at: "",
      promoted_at: "2026-04-20T00:00:00Z",
      retired_at: null,
    };
    expect(d.status).toBe("live");
    expect(Object.keys(d.prompt_pins)).toHaveLength(1);
  });

  it("StudioSessionSummary has phase and duration", () => {
    const s: StudioSessionSummary = {
      id: "s1",
      agent_id: "alice",
      deployment_id: "d1",
      skill_id: "math.algebra",
      skill_name: "Linear Equations",
      title: null,
      subtitle: null,
      current_phase: "complete",
      started_at: "",
      completed_at: "",
      duration_secs: 300,
      score: 0.8,
    };
    expect(s.current_phase).toBe("complete");
    expect(s.duration_secs).toBe(300);
  });

  it("ArchetypePromptSection defines a prompt slot", () => {
    const section: ArchetypePromptSection = {
      slug: "personality",
      display_name: "Personality",
      description: "Defines the tutor's tone",
      default_content: "You are warm and patient.",
      variables: [],
    };
    expect(section.slug).toBe("personality");
  });

  it("ArchetypeConfigParam supports all types", () => {
    const params: ArchetypeConfigParam[] = [
      { key: "voice", display_name: "Voice", description: "", type: "select", default: "george", options: ["george", "bella"] },
      { key: "max_steps", display_name: "Steps", description: "", type: "number", default: 8, min: 4, max: 12 },
      { key: "hints", display_name: "Hints", description: "", type: "boolean", default: true },
      { key: "name", display_name: "Name", description: "", type: "string", default: "" },
    ];
    expect(params).toHaveLength(4);
    expect(params[0].options).toContain("george");
    expect(params[1].min).toBe(4);
  });

  it("ModelSettings has provider and model", () => {
    const ms: ModelSettings = {
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      temperature: 0.7,
    };
    expect(ms.provider).toBe("anthropic");
  });

  it("UISettings has layout and widgets", () => {
    const ui: UISettings = {
      layout: "standard",
      widgets: ["whiteboard"],
      phases: ["lesson", "quiz"],
      narration: true,
      student_chat: true,
      quick_chips: ["Got it!"],
      advance_mode: "manual",
      chrome: { step_bar: true, title_bar: true, progress: "dots" },
      extensions: [],
    };
    expect(ui.layout).toBe("standard");
    expect(ui.widgets).toContain("whiteboard");
  });
});
