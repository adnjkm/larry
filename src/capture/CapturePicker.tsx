import * as stylex from "@stylexjs/stylex";
import { useRef } from "react";
import { colors, fonts } from "../tokens.stylex.ts";

export const MAX_PHOTOS = 4;

const styles = stylex.create({
  button: {
    width: "100%",
    minHeight: 160,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.ink,
    borderRadius: 0,
    backgroundColor: colors.orange,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 28,
    fontWeight: 600,
    cursor: "pointer",
  },
  input: { display: "none" },
});

export function CapturePicker({ onPick }: { onPick: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <button type="button" {...stylex.props(styles.button)} onClick={() => input.current?.click()}>
        Photograph something
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        {...stylex.props(styles.input)}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []).slice(0, MAX_PHOTOS);
          e.currentTarget.value = "";
          if (files.length > 0) onPick(files);
        }}
      />
    </>
  );
}
