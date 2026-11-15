import * as stylex from "@stylexjs/stylex";
import { CAMERA } from "../camera/look.ts";
import { circle } from "../surface/relief.ts";
import { Surface } from "../surface/Surface.tsx";
import { colors, fonts } from "../tokens.stylex.ts";

/** A bullet's size: a small raised dot, dithered like the keys. */
const BULLET = 8;

/**
 * A word as a dictionary sets it: the word in bold with its pronunciation beside it, small, in Paper Mono, in brackets;
 * its definition under it; then bullet points, each a raised dithered dot and a line.
 */
export function Term({ word, say, points = [], children }: { word: string; say?: string; points?: readonly string[]; children: string }) {
  return (
    <div {...stylex.props(s.term)}>
      <p {...stylex.props(s.head)}>
        <span {...stylex.props(s.word)}>{word}</span>
        {say ? <span {...stylex.props(s.say)}>({say})</span> : null}
      </p>
      <p {...stylex.props(s.text)}>{children}</p>
      {points.length ? (
        <ul {...stylex.props(s.points)}>
          {points.map((point) => (
            <li key={point} {...stylex.props(s.text, s.point)}>
              <span {...stylex.props(s.bullet)} aria-hidden>
                <Surface shape={circle(BULLET)} relief="cap" material="slate" ground="light" grain={CAMERA.grain} depth={CAMERA.relief} drift={CAMERA.idleDither} pad={3} />
              </span>
              {point}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const s = stylex.create({
  // As wide as its longest line, centred on the screen, its lines left-aligned within it.
  term: { flex: "none", alignSelf: "center", display: "flex", flexDirection: "column", gap: 4, maxWidth: "100%" },
  head: { margin: 0, display: "flex", alignItems: "baseline", gap: 8, fontFamily: fonts.sans, color: colors.ink },
  word: { fontSize: 20, lineHeight: "26px", fontWeight: 700, letterSpacing: "-0.01em" },
  say: { fontFamily: fonts.mono, fontSize: 12, lineHeight: "16px", color: colors.graphite },
  text: { margin: 0, fontFamily: fonts.sans, fontSize: 16, lineHeight: "22px", fontWeight: 500, color: colors.ink },
  points: { margin: 0, marginTop: 2, padding: 0, listStyle: "none" },
  // The dot hangs in the margin, so a point's words line up with each other.
  point: { position: "relative", paddingLeft: 16 },
  bullet: { position: "absolute", left: 2, top: 8, width: BULLET, height: BULLET },
});
