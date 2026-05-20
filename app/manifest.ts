import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tome",
    short_name: "Tome",
    description: "Listen to web novels as an audiobook",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050505",
    theme_color: "#050505",
    categories: ["books", "entertainment"],
    icons: [
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo-light.png",
        sizes: "2048x2048",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
