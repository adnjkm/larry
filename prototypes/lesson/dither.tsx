import { useEffect, useRef, useState } from "react";
import { threshold } from "../../src/surface/dither.ts";

const TONES = [[20, 20, 20], [107, 107, 107], [201, 201, 201], [255, 255, 255]] as const;

/**
 * A photo drawn as 1px Bayer-dithered greys, one canvas pixel per CSS pixel of its box. With
 * `aspect` (width / height) it crops to fill that shape; without it, it keeps the photo's shape.
 * The raw photo is never put on screen.
 */
export function Dither({ src, aspect, className }: { src: string; aspect?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (width === 0) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      const c = canvas.current;
      if (!live || !c) return;
      const ratio = aspect ?? img.width / img.height;
      const h = Math.round(width / ratio);
      const crop = img.width / img.height > ratio
        ? { sw: img.height * ratio, sh: img.height }
        : { sw: img.width, sh: img.width / ratio };
      c.width = width;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, (img.width - crop.sw) / 2, (img.height - crop.sh) / 2, crop.sw, crop.sh, 0, 0, width, h);
      const data = ctx.getImageData(0, 0, width, h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const lum = (0.2126 * data.data[i]! + 0.7152 * data.data[i + 1]! + 0.0722 * data.data[i + 2]!) / 255;
          const t = threshold(x, y);
          const [r, g, b] = TONES[Math.min(3, Math.floor(lum * 3 + t))]!;
          data.data[i] = r;
          data.data[i + 1] = g;
          data.data[i + 2] = b;
        }
      ctx.putImageData(data, 0, 0);
      c.dataset.ready = "";
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src, width, aspect]);

  return (
    <div ref={box} className={`dither ${className ?? ""}`} style={aspect ? { aspectRatio: String(aspect) } : undefined}>
      <canvas ref={canvas} data-dither />
    </div>
  );
}
