export default function DashboardLoading() {
  return (
    <div className="play-stage fixed inset-0 z-50 overflow-hidden">
      <div
        aria-hidden
        className="play-vignette pointer-events-none fixed inset-[-10%] z-0"
      />
      <div
        aria-hidden
        className="play-grain pointer-events-none fixed inset-0 z-[1]"
      />

      <div className="relative z-[2] grid min-h-full place-items-center px-6 text-center">
        <div className="flex flex-col items-center gap-5">
          <div className="play-anim-orb relative flex h-[120px] w-[120px] items-center justify-center">
            <div className="play-orb opacity-70" />
          </div>

          <div
            className="text-[10px] uppercase tracking-[0.28em]"
            style={{
              color: "var(--p-fg-mute)",
              fontFamily: "var(--font-jetbrains-mono)",
            }}
          >
            INITIATING…
          </div>
        </div>
      </div>
    </div>
  );
}
