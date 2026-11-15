import * as stylex from "@stylexjs/stylex";
import { camera } from "./camera.stylex.ts";
import { Button } from "@ui-sdk/react/button";
import { Surface } from "../surface/Surface.tsx";
import { circle } from "../surface/relief.ts";
import { radii } from "../tokens.stylex.ts";
import { CAMERA } from "./look.ts";

/** The shutter: a raised dish, pressed in while held. Its shape is the dithered dish; the button has no face of its own. */
export function Shutter({ disabled, pressed, onPress, onShoot }: { disabled: boolean; pressed: boolean; onPress: (down: boolean) => void; onShoot: () => void }) {
  const size = CAMERA.shutter;
  return (
    <Button
      aria-label="Take photo"
      disabled={disabled}
      {...stylex.props(s.button(size))}
      onPointerDown={() => onPress(true)}
      onPointerUp={() => onPress(false)}
      onPointerLeave={() => onPress(false)}
      onClick={onShoot}
    >
      <span {...stylex.props(s.face(size), pressed && s.pressed)}>
        <Surface shape={circle(size)} relief={pressed ? "dishPressed" : "dish"} grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} />
      </span>
    </Button>
  );
}

const s = stylex.create({
  button: (size: number) => ({
    width: size,
    height: size,
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radii.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    cursor: "pointer",
  }),
  face: (size: number) => ({ position: "relative", width: size, height: size, transition: `transform 160ms ${camera.easeOut}` }),
  pressed: { transform: "scale(0.94)" },
});
