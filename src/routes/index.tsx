import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Dino Run Pro — Browser Game" },
      { name: "description", content: "A polished Chrome Dino-style runner with characters, attacks, special abilities, day/night themes, and combos." },
    ],
  }),
});

function Home() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b0b12" }}>
      <iframe
        src="/game/index.html"
        title="Dino Run Pro"
        style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        allow="autoplay; fullscreen"
      />
    </div>
  );
}
