import type { MetadataRoute } from "next";

// Lets phones install the app to the home screen and open it full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Show Tracker",
    short_name: "Show Tracker",
    description: "Keep track of the shows and movies you and your friends are watching.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f0e0d",
    theme_color: "#0f0e0d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
