import { ShaderMaterial, DoubleSide, Vector3 } from "three";
import type { Finish } from "../../shared/kit.ts";

type FinishParams = {
  /** Scales the shade around mid-grey. Above 1 is harder, below 1 is flatter. */
  contrast: number;
  /** Shifts the shade, negative is darker. */
  bias: number;
  specular: number;
  shininess: number;
  /** 1 discards half the pixels so what is behind shows through. */
  clear: number;
};

const FINISHES: Record<Finish, FinishParams> = {
  matte: { contrast: 1, bias: 0, specular: 0, shininess: 1, clear: 0 },
  glossy: { contrast: 1, bias: 0, specular: 0.7, shininess: 70, clear: 0 },
  metal: { contrast: 1.7, bias: -0.04, specular: 0.9, shininess: 14, clear: 0 },
  rubber: { contrast: 0.55, bias: -0.1, specular: 0, shininess: 1, clear: 0 },
  clear: { contrast: 0.9, bias: 0.05, specular: 0.4, shininess: 40, clear: 1 },
};

const BAYER = /* glsl */ `
const float BAYER[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  return (BAYER[int(q.y) * 4 + int(q.x)] + 0.5) / 16.0;
}
const vec3 INK = vec3(0.078);
const vec3 ORANGE = vec3(1.0, 0.353, 0.122);
`;

const vertexShader = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Colours are written as the sRGB values they are, so no colour-space chunk is included.
const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uContrast;
uniform float uBias;
uniform float uSpecular;
uniform float uShininess;
uniform float uClear;
varying vec3 vNormal;
${BAYER}
void main() {
  float threshold = bayer(gl_FragCoord.xy);
  if (uClear > 0.5 && threshold < 0.5) discard;

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 light = vec3(-0.551, 0.651, 0.521);
  float lambert = max(dot(n, light), 0.0);
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0) * 0.15;
  float shade = 0.08 + 0.92 * lambert + rim;
  shade = (shade - 0.5) * uContrast + 0.5 + uBias;
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  shade += uSpecular * pow(max(dot(n, halfway), 0.0), uShininess);
  shade = clamp(shade, 0.0, 1.0);

  vec3 tones[5] = vec3[5](
    mix(uColor, INK, 0.85),
    mix(uColor, INK, 0.5),
    uColor,
    mix(uColor, vec3(1.0), 0.5),
    mix(uColor, vec3(1.0), 0.88)
  );
  int tone = int(clamp(floor(shade * 4.0 + threshold - 0.5 + 0.5), 0.0, 4.0));
  gl_FragColor = vec4(tones[tone], 1.0);
}
`;

const shadowVertexShader = /* glsl */ `
varying vec2 vDisc;
void main() {
  vDisc = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const shadowFragmentShader = /* glsl */ `
varying vec2 vDisc;
${BAYER}
void main() {
  float d = dot(vDisc, vDisc);
  if (d > 1.0) discard;
  float strength = pow(1.0 - d, 1.4);
  float threshold = bayer(gl_FragCoord.xy);
  if (strength < threshold) discard;
  gl_FragColor = vec4(strength > 0.62 + threshold * 0.3 ? INK : ORANGE, 1.0);
}
`;

function srgb(hex: string): Vector3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// The base tone sits at shade 0.5, but lit faces shade around 0.7. Darker colours shift further down so a black part stays black and only its highlights go grey.
function toneBias(rgb: Vector3): number {
  const luminance = 0.2126 * rgb.x + 0.7152 * rgb.y + 0.0722 * rgb.z;
  return -0.06 - 0.3 * (1 - luminance);
}

export function createDitherMaterial(color: string, finish: Finish): ShaderMaterial {
  const f = FINISHES[finish];
  const rgb = srgb(color);
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      uColor: { value: rgb },
      uContrast: { value: f.contrast },
      uBias: { value: f.bias + toneBias(rgb) },
      uSpecular: { value: f.specular },
      uShininess: { value: f.shininess },
      uClear: { value: f.clear },
    },
  });
}

// A funky-shadow style gradient (iamnoman.com/funky-shadow): the shadow's strength picks a colour
// along the stops, dithered between neighbours, so the glow fades from the first stop at its
// centre to the last at its edge.
const gradientShadowFragmentShader = /* glsl */ `
varying vec2 vDisc;
uniform vec3 uStops[6];
uniform int uCount;
${BAYER}
void main() {
  float d = dot(vDisc, vDisc);
  if (d > 1.0) discard;
  float strength = pow(1.0 - d, 1.4);
  float threshold = bayer(gl_FragCoord.xy);
  if (strength < threshold * 0.9) discard;
  float t = (1.0 - strength) * float(uCount - 1);
  int i = int(clamp(floor(t + threshold - 0.5 + 0.5), 0.0, float(uCount - 1)));
  vec3 colour = uStops[0];
  for (int k = 0; k < 6; k++) if (k == i) colour = uStops[k];
  gl_FragColor = vec4(colour, 1.0);
}
`;

/** The plain shadow, or with `stops` (up to 6, centre colour first) a dithered gradient glow. */
export function createShadowMaterial(stops?: readonly string[]): ShaderMaterial {
  const base = { vertexShader: shadowVertexShader, toneMapped: false, depthTest: false, depthWrite: false };
  if (!stops || stops.length < 2) return new ShaderMaterial({ ...base, fragmentShader: shadowFragmentShader });
  const colours = stops.slice(0, 6).map(srgb);
  while (colours.length < 6) colours.push(colours[colours.length - 1] as Vector3);
  return new ShaderMaterial({
    ...base,
    fragmentShader: gradientShadowFragmentShader,
    uniforms: { uStops: { value: colours }, uCount: { value: Math.min(stops.length, 6) } },
  });
}
