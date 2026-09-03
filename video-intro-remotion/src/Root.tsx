import React from "react";
import { Composition } from "remotion";
import { IntroVideo } from "./IntroVideo";
import type { Manifest } from "./types/manifest";
import ex1StubFile from "../manifests/ex1-stub.json" assert { type: "json" };

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;

// Compute duration in frames from the manifest's last beat end_s.
function durationFrames(m: Manifest): number {
  if (m.render?.duration_s) return Math.round(m.render.duration_s * FPS);
  if (m.beats.length === 0) return FPS; // 1s fallback for empty briefs
  return Math.round(m.beats[m.beats.length - 1].end_s * FPS);
}

// Manifests on disk are wrapped as { manifest: ... } so Remotion's --props
// flag passes them through as a single `manifest` prop. Older files (and the
// stale ex1-stub before the wrap fix) may be unwrapped — handle both shapes.
function unwrapManifest(raw: unknown): Manifest {
  if (raw && typeof raw === "object" && "manifest" in (raw as object)) {
    return (raw as { manifest: Manifest }).manifest;
  }
  return raw as Manifest;
}

export const RemotionRoot: React.FC = () => {
  const ex1 = unwrapManifest(ex1StubFile);
  return (
    <>
      <Composition
        id="IntroVideo"
        component={IntroVideo}
        // Fallback duration if calculateMetadata doesn't fire (e.g. Remotion
        // Studio's first paint before props resolve). Real duration is
        // recomputed below from whatever manifest --props passes in.
        durationInFrames={durationFrames(ex1)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ manifest: ex1 }}
        calculateMetadata={({ props }) => ({
          durationInFrames: durationFrames(unwrapManifest(props.manifest)),
        })}
      />
    </>
  );
};
