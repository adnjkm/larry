import * as stylex from "@stylexjs/stylex";
import { FileInput, FileInputTrigger } from "@ui-sdk/react/file-input";
import { MAX_PHOTOS } from "../../shared/photos.ts";
import { buttons, layout, type } from "../ui/styles.ts";

const styles = stylex.create({
  screen: { flexGrow: 1, display: "flex", flexDirection: "column", gap: 20 },
  intro: { marginBlock: "auto" },
});

// Always empty, so the same photos can be picked again after a failed scan.
const NO_FILES: File[] = [];

export function CapturePicker({ onPick }: { onPick: (files: File[]) => void }) {
  return (
    <div {...stylex.props(styles.screen)}>
      <div {...stylex.props(layout.inset, layout.tight, styles.intro)}>
        <p {...stylex.props(type.label, type.labelAccent)}>Larry</p>
        <h1 {...stylex.props(type.title)}>See how everyday things work</h1>
        <p {...stylex.props(type.muted)}>Larry takes it apart, then you rebuild it one problem at a time.</p>
      </div>
      <FileInput
        accept="image/*"
        capture="environment"
        multiple
        maxFiles={MAX_PHOTOS}
        value={NO_FILES}
        onValueChange={(files) => {
          if (files.length > 0) onPick(files);
        }}
      >
        <FileInputTrigger {...stylex.props(buttons.base, buttons.primary)}>Photograph something</FileInputTrigger>
      </FileInput>
    </div>
  );
}
