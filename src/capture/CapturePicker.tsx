import * as stylex from "@stylexjs/stylex";
import { FileInput, FileInputTrigger } from "@ui-sdk/react/file-input";
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
});

// Always empty, so the same photos can be picked again after a failed scan.
const NO_FILES: File[] = [];

export function CapturePicker({ onPick }: { onPick: (files: File[]) => void }) {
  return (
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
      <FileInputTrigger {...stylex.props(styles.button)}>Photograph something</FileInputTrigger>
    </FileInput>
  );
}
