import * as stylex from "@stylexjs/stylex";
import { useRef } from "react";
import { MAX_PHOTOS } from "../../shared/photos.ts";
import { buttons, layout, type } from "../styles.ts";

const styles = stylex.create({
  screen: { flexGrow: 1, display: "flex", flexDirection: "column", gap: 20 },
  intro: { marginBlock: "auto" },
  input: { display: "none" },
});

export function CapturePicker({ onPick }: { onPick: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div {...stylex.props(styles.screen)}>
      <div {...stylex.props(layout.inset, layout.tight, styles.intro)}>
        <p {...stylex.props(type.label, type.labelAccent)}>Larry</p>
        <h1 {...stylex.props(type.title)}>See how everyday things work</h1>
        <p {...stylex.props(type.muted)}>Photograph an object. Larry takes it apart, then you rebuild it one problem at a time.</p>
      </div>
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
