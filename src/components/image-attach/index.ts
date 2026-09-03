"use client";

/**
 * Public barrel for the image-attach feature.
 *
 * `ImageAttachPanel` is wrapped in `next/dynamic({ ssr: false })` so
 * the capture UI (camera, drawing canvas, etc.) only loads when the
 * user clicks the launcher button. The launcher itself is light and
 * imported directly.
 */

import dynamic from "next/dynamic";
import type { ImageAttachPanelProps } from "./image-attach-panel";

export { ImageAttachLauncher } from "./image-attach-launcher";

export const ImageAttachPanel = dynamic<ImageAttachPanelProps>(
  () => import("./image-attach-panel").then((m) => m.ImageAttachPanel),
  { ssr: false },
);
