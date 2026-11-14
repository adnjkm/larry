import * as stylex from "@stylexjs/stylex";
import { useRef } from "react";
import { MAX_PHOTOS } from "../../shared/photos.ts";
import { buttons } from "../styles.ts";

const styles = stylex.create({
  centered: { marginBlock: "auto" },
  input: { display: "none" },
});

export function CapturePicker({ onPick }: { onPick: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div {...stylex.props(styles.centered)}>
      <button type="button" {...stylex.props(buttons.base, buttons.primary)} onClick={() => input.current?.click()}>
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
    </div>
  );
}
