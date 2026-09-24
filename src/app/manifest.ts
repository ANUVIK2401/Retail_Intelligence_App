import type { MetadataRoute } from "next";
import { PRODUCT } from "@/config/product";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT.name,
    short_name: PRODUCT.shortName,
    description: PRODUCT.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f3",
    theme_color: "#153847",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
