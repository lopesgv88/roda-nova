import { SvgXml } from "react-native-svg";
import { ART_LOGO } from "./art";

/** Logo do Roda Nova: a roda sendo pintada, com o pó da tinta batendo nela. */
export function PaintedLogo({ size = 96 }: { size?: number }) {
  return <SvgXml xml={ART_LOGO} width={size} height={size} />;
}
