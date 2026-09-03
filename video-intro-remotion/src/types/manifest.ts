// Manifest types — mirror reference/brief.schema.json v0.1.0.
// Briefs are produced by the agents/video_intro orchestrator and validated against
// brief.schema.json. The orchestrator resolves asset URLs and emits a manifest
// that Remotion consumes via `--props=manifest.json`.
//
// Keep this file in sync with brief.schema.json. If you add fields there, add
// them here and update the routing in src/IntroVideo.tsx.

export type Palette = "white_on_black";
export type BackgroundMotif =
  | "wireframe_terrain"
  | "starfield"
  | "sparse_arcs"
  | "blank";

export type StyleStrategy = "metaphorical" | "literal" | "mixed";

export type OverlayKind = "caption" | "math" | "label" | "callout";

export type OverlayPosition =
  | "bottom_center"
  | "bottom_left"
  | "bottom_right"
  | "top_center"
  | "top_left"
  | "top_right"
  | "center"
  | "anchor";

export interface Overlay {
  kind: OverlayKind;
  content: string;
  position?: OverlayPosition;
  /** seconds, relative to beat start */
  appear_s?: number;
  /** seconds, relative to beat start. Omit for "stay until beat end". */
  disappear_s?: number;
}

/** Discriminated union of primitive specs the code renderer understands. */
export type CodePrimitive =
  | {
      primitive: "wireframe_mountain";
      props: {
        peak_height?: number;
        peak_sharpness?: number;
        secondary_peak_height?: number;
        camera?: "slow_push_in" | "continued_push_in" | "orbit_right";
        show_grid_floor?: boolean;
        show_both?: boolean;
        particle_flow_up?: boolean;
      };
      anchor_id?: string;
    }
  | {
      primitive: "animated_line";
      props: {
        lines: Array<{
          label: string;
          slope: number;
          intercept?: number;
          color?: string;
          draw_in_ms?: number;
        }>;
        axes_fade_in_ms?: number;
        overlay_on?: BackgroundMotif;
      };
      anchor_id?: string;
    }
  | {
      primitive: "rise_run_callout";
      props: {
        line_slope: number;
        show_rise_run_triangle?: boolean;
        rise_label?: string;
        run_label?: string;
        formula_latex?: string;
      };
    }
  | {
      primitive: "outro_callouts";
      props: {
        background?: "particle_wave_terrain" | "blank";
        callouts_top_left?: string;
        callouts_top_right?: string;
        callouts_bottom_left?: string;
        callouts_bottom_right?: string;
      };
    }
  | {
      primitive: "coordinate_axes";
      props: {
        x_range?: [number, number];
        y_range?: [number, number];
        tick_interval?: number;
        show_grid?: boolean;
        show_origin_label?: boolean;
        axis_label_x?: string;
        axis_label_y?: string;
        highlight_quadrant?: 1 | 2 | 3 | 4;
        overlay_on?: "wireframe_terrain" | "blank";
      };
      anchor_id?: string;
    }
  | {
      primitive: "fraction_compare";
      props: {
        left: { num: number; denom: number; label?: string };
        right: { num: number; denom: number; label?: string };
        operator?: "<" | ">" | "=" | "auto";
        style?: "bar" | "pie" | "both";
        overlay_on?: "wireframe_terrain" | "blank";
      };
      anchor_id?: string;
    }
  | {
      primitive: "callout_grid";
      props: {
        layout?: "2x2" | "1x4" | "1x3";
        cells: Array<{
          heading?: string;
          body: string;
          accent?: "primary" | "default";
        }>;
        background?: "wireframe_terrain" | "blank";
        stagger_ms?: number;
      };
      anchor_id?: string;
    }
  | {
      primitive: "scale_bar";
      props: {
        bars: Array<{ value: number; label: string; color?: string }>;
        unit?: string;
        show_ratio?: boolean;
        overlay_on?: "wireframe_terrain" | "blank";
      };
      anchor_id?: string;
    }
  | {
      primitive: "coin_flip";
      props: {
        outcomes?: Array<"H" | "T">;
        show_probability?: boolean;
        flip_duration_ms?: number;
        landing_dwell_ms?: number;
        overlay_on?: "wireframe_terrain" | "blank";
      };
      anchor_id?: string;
    }
  // ── PRIMITIVE_REGISTRATIONS:start ─────────────────────────
  // AI-authored primitive types. Inserted by
  // agents/video_intro/patchers.py between these markers.
  // Do not edit by hand.
    | {
      primitive: "basketball_trajectory";
      props: {
        show_ball?: boolean; trajectory_color?: string; hoop_position?: [number, number]; launch_angle?: number; show_arc_trace?: boolean;
      };
      anchor_id?: string;
    }
  | {
      primitive: "parabola_plot";
      props: {
        a: number; b: number; c: number; x_range?: [number, number]; show_vertex?: boolean; color?: string;
      };
      anchor_id?: string;
    }
  | {
      primitive: "equation_solver";
      props: {
        equation: string;
        steps: string[];
        highlight_solution?: boolean;
        step_duration_ms?: number;
      };
      anchor_id?: string;
    }
  | {
      primitive: "balance_scale";
      props: {
        left_weight: number;
        right_weight: number;
        show_equilibrium: boolean;
        animation: "gentle_sway" | "tilt_left" | "tilt_right" | "static";
      };
      anchor_id?: string;
    }
  | {
      primitive: "equation_balance";
      props: {
        equation: string; show_balance_metaphor?: boolean; highlight_both_sides?: boolean;
      };
      anchor_id?: string;
    }
  | {
      primitive: "medical_test_visual";
      props: {
        test_result: "positive" | "negative";
        show_uncertainty?: boolean;
        animation?: "test_reveal" | "static" | "pulse";
      };
      anchor_id?: string;
    }
  | {
      primitive: "rational_function_plot";
      props: {
        numerator_degree: number; denominator_degree: number; show_asymptotes?: boolean; show_peak_marker?: boolean; highlight_undefined_regions?: boolean; animation?: string;
      };
      anchor_id?: string;
    }
  | {
      primitive: "satellite_dish";
      props: {
        dish_width?: number;
        focal_length?: number;
        num_rays?: number;
        draw_in_ms?: number;
        ray_animate_ms?: number;
        show_focus_marker?: boolean;
      };
      anchor_id?: string;
    }
  | {
      primitive: "satellite_triangulation";
      props: {
        num_satellites: number;
        show_distance_lines: boolean;
        animation: 'pulse_signals' | 'static';
      };
      anchor_id?: string;
    }
  | {
      primitive: "basketball_shot";
      props: {
        release_position?: [number, number];
        rim_position?: [number, number];
        peak_height_pixels?: number;
        show_trail?: boolean;
        show_court_floor?: boolean;
        ball_radius?: number;
      };
      anchor_id?: string;
    }
  | {
      primitive: "basketball_bounce";
      props: {
        initial_height_pixels?: number;
        restitution?: number;
        num_bounces?: number;
        show_trail?: boolean;
        show_heights?: boolean;
        ball_radius?: number;
        horizontal_speed_pixels_per_s?: number;
      };
      anchor_id?: string;
    }
  | {
      primitive: "linear_hill_story";
      props: {
        slope?: number;
        y_intercept?: number;
        x_range?: [number, number];
        y_range?: [number, number];
        phase?:
          | "character_idle"
          | "rolling"
          | "slope_arrows"
          | "y_intercept_glow"
          | "x_intercept_catch"
          | "celebration";
        show_axes?: boolean;
        show_equation_label?: boolean;
        ball_position_x?: number;
      };
      anchor_id?: string;
    }
// ── PRIMITIVE_REGISTRATIONS:end ───────────────────────────
  | {
      // Remaining placeholders — declared so the brief generator's
      // vocabulary still parses, but the renderer falls back to the
      // debug marker until these are implemented (see ROADMAP).
      // `anchor_pan` is a camera helper, not visual content (deferred).
      // `particle_terrain` is a background variant of WireframeTerrain
      // (deferred — covered by overlay_on="wireframe_terrain" today).
      primitive: "particle_terrain" | "anchor_pan";
      props: Record<string, unknown>;
      anchor_id?: string;
    };

export interface BeatVisual {
  primary: string;
  /** The renderer_hint carries optional `code` (a CodePrimitive that
   *  the Remotion composition routes to one of the React primitives).
   *  A beat with no `code` renders as a black frame with caption +
   *  audio overlay — a valid choice for transition / establishing
   *  moments that don't need a visual. */
  renderer_hint: {
    code?: CodePrimitive;
  };
}

export interface Beat {
  id: string;
  start_s: number;
  end_s: number;
  narration_span: string;
  visual: BeatVisual;
  overlays?: Overlay[];
}

export interface AnchorObject {
  id: string;
  description: string;
}

export interface Manifest {
  version: "0.1.0";
  lesson_ref: {
    topic_slug: string;
    subtopic_slug: string;
    lesson_id: string | null;
    is_custom: boolean;
  };
  topic: string;
  concept: {
    math_concept: string;
    real_world_analog: string;
    style_strategy: StyleStrategy;
  };
  style: {
    palette: Palette;
    background_motif: BackgroundMotif;
    anchor_objects: AnchorObject[];
  };
  narration: {
    script: string;
    voice: { provider: "elevenlabs" | "openai"; voice_id: string };
    audio_url: string | null;
    audio_duration_s: number | null;
    word_timings: Array<{ word: string; start_s: number; end_s: number }>;
  };
  beats: Beat[];
  qa_constraints?: {
    max_dead_frame_seconds?: number;
    dead_frame_brightness_threshold?: number;
  };
  /** Render-time additions written by the orchestrator. Not part of the brief. */
  render?: {
    /** Fallback audio path if narration.audio_url is null (Remotion needs *something*). */
    audio_path_local?: string;
    /** Total duration override; otherwise derived from last beat's end_s. */
    duration_s?: number;
  };
}
