// ─── Studio Agent Registry Types ─────────────────────────────────────────────

export interface PromptVariable {
  name: string;
  type: "string" | "number" | "boolean";
  default?: string;
  required: boolean;
  description?: string;
}

// ─── Config Section Types ────────────────────────────────────────────────────

export interface ModelSettings {
  provider: "anthropic" | "openai";
  model: string;
  max_tokens: number;
  temperature: number;
}

export interface ChromeSettings {
  step_bar: boolean;
  title_bar: boolean;
  progress: "dots" | "ring" | "bar" | "none";
}

export interface ExtensionDeclaration {
  slot: string;
  component: string;
  props?: Record<string, unknown>;
}

export interface UISettings {
  layout: "standard" | "workspace" | "split-pane" | "canvas";
  widgets: string[];
  phases: string[];
  narration: boolean;
  student_chat: boolean;
  quick_chips: string[];
  advance_mode: "manual" | "auto" | "narration-complete";
  chrome: ChromeSettings;
  extensions: ExtensionDeclaration[];
}

export interface InteractionRules {
  max_lesson_steps: number;
  practice_count_min: number;
  practice_count_max: number;
  quiz_count_min: number;
  quiz_count_max: number;
  show_hints: boolean;
  hint_escalation: boolean;
  allow_student_chat: boolean;
  nudge_delay_ms: number;
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export interface StudioAgent {
  id: string;
  display_name: string;
  tagline: string | null;
  description: string | null;
  icon_url: string | null;
  avatar_color: string;
  domain: string;
  status: "draft" | "active" | "archived";
  sort_order: number;
  archetype_id: string | null;
  agent_config: Record<string, unknown>;
  cloned_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioAgentDetail extends StudioAgent {
  config_sections: {
    model_settings?: ModelSettings;
    ui_settings?: UISettings;
    interaction_rules?: InteractionRules;
  };
  prompts: StudioPromptSlotSummary[];
}

// ─── Prompt Slots ────────────────────────────────────────────────────────────

export interface StudioPromptSlotSummary {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  sort_order: number;
  latest_version: StudioPromptVersion | null;
}

export interface StudioPromptSlot {
  id: string;
  agent_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

// ─── Prompt Versions ─────────────────────────────────────────────────────────

export interface StudioPromptVersion {
  id: string;
  prompt_id: string;
  version: number;
  content: string;
  variables: PromptVariable[];
  status: "draft" | "published" | "archived";
  author: string | null;
  change_note: string | null;
  created_at: string;
}

// ─── Config Sections ─────────────────────────────────────────────────────────

export interface StudioConfigSection {
  section: string;
  data: Record<string, unknown>;
  updated_at: string;
}

// ─── Deployments ─────────────────────────────────────────────────────────────

export interface StudioDeployment {
  id: string;
  agent_id: string;
  version: number;
  status: "staging" | "live" | "retired";
  prompt_pins: Record<string, string>;
  config_snapshot: Record<string, unknown>;
  change_note: string | null;
  deployed_by: string | null;
  created_at: string;
  promoted_at: string | null;
  retired_at: string | null;
}

// ─── Live Sessions ───────────────────────────────────────────────────────────

export interface StudioSessionSummary {
  id: string;
  agent_id: string;
  deployment_id: string | null;
  skill_id: string;
  skill_name: string | null;
  title: string | null;
  subtitle: string | null;
  current_phase: string;
  started_at: string;
  completed_at: string | null;
  duration_secs: number | null;
  score: number | null;
}

export interface StudioSessionDetail extends StudioSessionSummary {
  skill_description: string | null;
  agent_config_snapshot: Record<string, unknown>;
  resolved_prompts: Record<string, string>;
  messages: Record<string, unknown>[];
  steps: Record<string, unknown>[];
  phases_completed: string[];
  title: string | null;
  subtitle: string | null;
  evaluator_run_id: string | null;
  metadata: Record<string, unknown>;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface StudioPromptValidateResponse {
  resolved: string | null;
  errors: string[];
  extracted_variables: string[];
}

// ─── Archetypes ─────────────────────────────────────────────────────────────

export interface ArchetypePromptSection {
  slug: string;
  display_name: string;
  description: string;
  default_content: string;
  variables: PromptVariable[];
}

export interface ArchetypeSkill {
  slug: string;
  enabled_by_default: boolean;
  default_config: Record<string, unknown>;
}

export interface ArchetypeConfigParam {
  key: string;
  display_name: string;
  description: string;
  type: "string" | "number" | "boolean" | "select";
  default: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

export interface StudioArchetypeSummary {
  id: string;
  display_name: string;
  description: string | null;
  domain: string;
  prompt_sections_count: number;
  skills_count: number;
  config_params_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface StudioArchetypeDetail {
  id: string;
  display_name: string;
  description: string | null;
  domain: string;
  prompt_sections: ArchetypePromptSection[];
  skills: ArchetypeSkill[];
  config_schema: ArchetypeConfigParam[];
  created_at: string | null;
  updated_at: string | null;
}

export interface StudioArchetypeCreateInput {
  id: string;
  display_name: string;
  description?: string;
  domain?: string;
  prompt_sections?: ArchetypePromptSection[];
  skills?: ArchetypeSkill[];
  config_schema?: ArchetypeConfigParam[];
}

export interface StudioArchetypeUpdateInput {
  display_name?: string;
  description?: string;
  domain?: string;
  prompt_sections?: ArchetypePromptSection[];
  skills?: ArchetypeSkill[];
  config_schema?: ArchetypeConfigParam[];
}

// ─── API Input Types ─────────────────────────────────────────────────────────

export interface StudioAgentCreateInput {
  id: string;
  display_name: string;
  tagline?: string;
  description?: string;
  icon_url?: string;
  avatar_color?: string;
  domain?: "math" | "rw" | "general";
  status?: "draft" | "active" | "archived";
  sort_order?: number;
  archetype_id?: string;
  agent_config?: Record<string, unknown>;
  model_settings?: Partial<ModelSettings>;
  ui_settings?: Partial<UISettings>;
  interaction_rules?: Partial<InteractionRules>;
}

export interface StudioAgentUpdateInput {
  display_name?: string;
  tagline?: string;
  description?: string;
  icon_url?: string;
  avatar_color?: string;
  domain?: "math" | "rw" | "general";
  status?: "draft" | "active" | "archived";
  sort_order?: number;
}

export interface StudioPromptSlotCreateInput {
  slug: string;
  display_name: string;
  description?: string;
  sort_order?: number;
}

export interface StudioPromptVersionCreateInput {
  content: string;
  variables?: PromptVariable[];
  author?: string;
  change_note?: string;
}

export interface StudioDeploymentCreateInput {
  prompt_pins: Record<string, string>;
  change_note?: string;
  deployed_by?: string;
}
