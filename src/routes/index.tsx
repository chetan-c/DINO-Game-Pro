import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dino Run — Chrome Dino Clone" },
      { name: "description", content: "A Chrome Dino style endless runner built with HTML, CSS and Vanilla JS." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/dino/index.html"
      title="Dino Run"
      className="block w-screen h-screen border-0"
    />
  );
}
