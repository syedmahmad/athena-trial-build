import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Beat, Manifest, CodePrimitive } from "./types/manifest";
import { OverlayLayer } from "./overlays/OverlayLayer";
import { WireframeMountain } from "./primitives/WireframeMountain";
import { AnimatedLine } from "./primitives/AnimatedLine";
import { RiseRunCallout } from "./primitives/RiseRunCallout";
import { OutroCallouts } from "./primitives/OutroCallouts";
import { CoordinateAxes } from "./primitives/CoordinateAxes";
import { FractionCompare } from "./primitives/FractionCompare";
import { CalloutGrid } from "./primitives/CalloutGrid";
import { ScaleBar } from "./primitives/ScaleBar";
import { CoinFlip } from "./primitives/CoinFlip";
// ── PRIMITIVE_IMPORTS:start ──────────────────────────────────
// AI-authored primitive imports. Inserted by
// agents/video_intro/patchers.py between these markers.
// Do not edit by hand.
import { BasketballTrajectory } from "./primitives/BasketballTrajectory";
import { ParabolaPlot } from "./primitives/ParabolaPlot";
import { EquationSolver } from "./primitives/EquationSolver";
import { BalanceScale } from "./primitives/BalanceScale";
import { EquationBalance } from "./primitives/EquationBalance";
import { MedicalTestVisual } from "./primitives/MedicalTestVisual";
import { RationalFunctionPlot } from "./primitives/RationalFunctionPlot";
import { SatelliteDish } from "./primitives/SatelliteDish";
import { SatelliteTriangulation } from "./primitives/SatelliteTriangulation";
import { BasketballShot } from "./primitives/BasketballShot";
import { BasketballBounce } from "./primitives/BasketballBounce";
import { LinearHillStory } from "./primitives/LinearHillStory";
// ── PRIMITIVE_IMPORTS:end ────────────────────────────────────
import { secondsToFrames } from "./utils/timing";

function renderPrimitive(
  prim: CodePrimitive | undefined,
  beatDurationFrames: number,
): React.ReactNode {
  // Also treat empty `{}` (left behind when the orchestrator clears a
  // code block on failed primitive authoring) as "no primitive". Without
  // this guard, the switch falls through to the default case and renders
  // "[primitive not implemented: ]" with a blank name on screen.
  if (!prim || !prim.primitive) return null;
  switch (prim.primitive) {
    case "wireframe_mountain":
      return (
        <WireframeMountain
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "animated_line":
      return (
        <AnimatedLine
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "rise_run_callout":
      return (
        <RiseRunCallout
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "outro_callouts":
      return (
        <OutroCallouts
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "coordinate_axes":
      return (
        <CoordinateAxes
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "fraction_compare":
      return (
        <FractionCompare
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "callout_grid":
      return (
        <CalloutGrid
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "scale_bar":
      return (
        <ScaleBar
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "coin_flip":
      return (
        <CoinFlip
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    // ── PRIMITIVE_REGISTRATIONS:start ─────────────────────────
    // AI-authored switch cases. Inserted by
    // agents/video_intro/patchers.py between these markers.
    // Do not edit by hand.
        case "basketball_trajectory":
      return (
        <BasketballTrajectory
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "parabola_plot":
      return (
        <ParabolaPlot
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "equation_solver":
      return (
        <EquationSolver
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "balance_scale":
      return (
        <BalanceScale
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "equation_balance":
      return (
        <EquationBalance
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "medical_test_visual":
      return (
        <MedicalTestVisual
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "rational_function_plot":
      return (
        <RationalFunctionPlot
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "satellite_dish":
      return (
        <SatelliteDish
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "satellite_triangulation":
      return (
        <SatelliteTriangulation
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "basketball_shot":
      return (
        <BasketballShot
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "basketball_bounce":
      return (
        <BasketballBounce
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
    case "linear_hill_story":
      return (
        <LinearHillStory
          {...prim.props}
          beatDurationFrames={beatDurationFrames}
        />
      );
// ── PRIMITIVE_REGISTRATIONS:end ───────────────────────────
    default:
      // Unimplemented primitive — show a debug marker so missing primitives surface in QA.
      return (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            color: "white",
            opacity: 0.4,
            fontFamily: "monospace",
            fontSize: 18,
          }}
        >
          [primitive not implemented: {prim.primitive}]
        </div>
      );
  }
}

function BeatRenderer({
  beat,
  fps,
}: {
  beat: Beat;
  fps: number;
}) {
  const beatStartFrame = secondsToFrames(beat.start_s, fps);
  const beatDurationFrames =
    secondsToFrames(beat.end_s, fps) - beatStartFrame;
  const beatEndS = beat.end_s - beat.start_s;

  // Defensive: <Sequence> throws on durationInFrames <= 0. Brief generators
  // occasionally emit zero-duration beats (e.g. an outro_callouts beat whose
  // start_s == end_s because the narration reallocator consumed all audio
  // into earlier beats). Skip such beats — the alternative is a hard crash
  // that wastes the rest of the render.
  if (beatDurationFrames <= 0) {
    return null;
  }

  // Touch katex so the runtime import isn't tree-shaken on beats with no overlays.
  // (KaTeX is imported transitively through OverlayLayer/RiseRunCallout but this
  // makes the dependency explicit.)
  void katex;

  return (
    <Sequence from={beatStartFrame} durationInFrames={beatDurationFrames}>
      <AbsoluteFill style={{ backgroundColor: "transparent" }}>
        {renderPrimitive(beat.visual.renderer_hint.code, beatDurationFrames)}
        {beat.overlays && beat.overlays.length > 0 ? (
          <OverlayLayer overlays={beat.overlays} beatEndS={beatEndS} />
        ) : null}
      </AbsoluteFill>
    </Sequence>
  );
}

export const IntroVideo: React.FC<{ manifest: Manifest }> = ({ manifest }) => {
  const { fps } = useVideoConfig();
  // Prefer the staged local path (Remotion-public relative) over a remote URL.
  const audioSrc = (() => {
    const local = manifest.render?.audio_path_local;
    if (local) return staticFile(local);
    const url = manifest.narration.audio_url;
    if (url && /^(https?:|file:|\/)/.test(url)) return url;
    return null;
  })();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {manifest.beats.map((beat) => (
        <BeatRenderer key={beat.id} beat={beat} fps={fps} />
      ))}
      {audioSrc ? <Audio src={audioSrc} /> : null}
    </AbsoluteFill>
  );
};
