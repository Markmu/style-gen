import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Visoryn",
    short_name: "Visoryn",
    description:
      "Turn reference images into editable visual evidence and new renders.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9fb",
    theme_color: "#f7f9fb",
    icons: [
      {
        src: "/visoryn-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
