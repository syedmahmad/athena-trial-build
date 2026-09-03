/** Strip markdown, LaTeX, and other TTS-unfriendly syntax so text reads naturally. */
export function sanitizeForTTS(text: string): string {
  return text
    // Remove LaTeX blocks: $$...$$ and $...$
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$]+?\$/g, "")
    // Remove inline LaTeX commands like \frac{a}{b}
    .replace(/\\[a-zA-Z]+\{[^}]*\}/g, "")
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    // Remove markdown emphasis underscores (_italic_)
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // [3B] Convert fill-in-the-blank underscores to "blank"
    .replace(/_{2,}/g, "blank")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove code fences
    .replace(/```[\s\S]*?```/g, "")
    // Remove markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove images ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove remaining backslashes from LaTeX
    .replace(/\\/g, "")
    // Replace dashes with natural pauses
    .replace(/\s*--\s*/g, ", ")
    .replace(/\s*—\s*/g, ", ")
    // [3A] Split digit+variable: "2x" → "2 x"
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    // Decimal numbers: "3.14" → "3 point 14"
    .replace(/(\d)\.(\d)/g, "$1 point $2")
    // Abbreviation dots: "e.g." → "eg", "U.S.A." → "USA"
    .replace(/(?<=[A-Za-z])\.(?=[A-Za-z])/g, "")
    // Remaining period not at sentence boundary → remove
    .replace(/\.(?=[^\s])/g, "")
    // Collapse whitespace
    .replace(/\n+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .replace(/^[.,;:\s]+/, "");
}
