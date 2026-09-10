import type { Metadata } from "next";
import DomeHandoff3V from "../components/DomeHandoff3V";

export const metadata: Metadata = {
  title: "Black Belt Building Dome CAD — 12′8″ 3V Reference",
  description: "Black Belt Building's independently audited 12-foot-8-inch Class-I 3V five-eighths dome centerline reference, with layers, unique member axes, gross face geometry, and explicit release boundaries.",
};

export default function ThreeVDomePage() {
  return <DomeHandoff3V />;
}
