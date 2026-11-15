import type { ReactNode } from "react";

/** React Bits Fade Content's plain mount reveal, adapted to native CSS.
 * https://reactbits.dev/animations/fade-content
 * No scroll effects, blur, animation dependency, or hidden waiting state.
 */
export default function FadeContent({ children, className = "" }: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`fade-content ${className}`}>{children}</div>;
}
