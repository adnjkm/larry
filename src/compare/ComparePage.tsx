import * as stylex from "@stylexjs/stylex";
import { type Kit, parseKit } from "../../shared/kit.ts";
import { KitViewer } from "../kit3d/KitViewer.tsx";
import { colors, fonts } from "../tokens.stylex.ts";

const photoUrls = import.meta.glob<string>("../../fixtures/photos/*.jpg", { eager: true, query: "?url", import: "default" });
const kitJson = import.meta.glob<unknown>("../../fixtures/kits/*.json", { eager: true, import: "default" });

const nameOf = (path: string) => path.split("/").pop()?.replace(/\.\w+$/, "") ?? path;

const rows: { name: string; photo: string; kit: Kit }[] = [];
for (const [path, photo] of Object.entries(photoUrls)) {
  const raw = Object.entries(kitJson).find(([p]) => nameOf(p) === nameOf(path))?.[1];
  if (raw !== undefined) rows.push({ name: nameOf(path), photo, kit: parseKit(raw) });
}

const ROW_HEIGHT = 360;

const styles = stylex.create({
  page: { display: "flex", flexDirection: "column", gap: 24, padding: 24, backgroundColor: colors.paper, color: colors.ink, fontFamily: fonts.sans },
  row: { display: "flex", gap: 24, alignItems: "flex-start" },
  photo: { width: 540, height: ROW_HEIGHT, objectFit: "contain", backgroundColor: colors.soft, flexShrink: 0 },
  viewer: { width: 540, flexShrink: 0 },
  meta: { display: "flex", flexDirection: "column", gap: 4, fontFamily: fonts.mono, fontSize: 14 },
  graphite: { color: colors.graphite },
});

export default function ComparePage() {
  return (
    <div {...stylex.props(styles.page)}>
      {rows.map(({ name, photo, kit }) => (
        <div key={name} {...stylex.props(styles.row)}>
          <img src={photo} alt={name} {...stylex.props(styles.photo)} />
          <div {...stylex.props(styles.viewer)}>
            <KitViewer parts={kit.parts} elevation={12} azimuth={15} height={ROW_HEIGHT} />
          </div>
          <div {...stylex.props(styles.meta)}>
            <strong>{kit.name}</strong>
            <span {...stylex.props(styles.graphite)}>{kit.parts.length} parts</span>
          </div>
        </div>
      ))}
    </div>
  );
}
