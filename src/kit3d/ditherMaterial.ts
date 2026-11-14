import { DoubleSide, ShaderMaterial, Vector3 } from "three";
import type { Finish } from "../../shared/kit.ts";
import { DEFAULT_LOOK, type DitherLook } from "./ditherLook.ts";

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

function srgb(hex: string): Vector3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const RAD = Math.PI / 180;

function lookValues(look: DitherLook) {
  const angle = look.light.angle * RAD;
  const height = look.light.height * RAD;
  return {
    uMatrix: look.pixels.matrix,
    uDither: look.pixels.dither,
    uTones: look.tones.count,
    uToneDark: look.tones.dark,
    uToneLight: look.tones.light,
    uToneCurve: look.tones.curve,
    // In view space, so the light stays put while the kit spins under it.
    uLight: new Vector3(Math.sin(angle) * Math.cos(height), Math.sin(height), Math.cos(angle) * Math.cos(height)),
    uAmbient: look.light.ambient,
    uRim: look.light.rim,
    uLookContrast: look.light.contrast,
    uBrightness: look.light.brightness,
    uDarkColors: look.light.darkColors,
    uLookSpecular: look.light.specular,
    uShadowSoftness: look.shadow.softness,
    uShadowCore: look.shadow.core,
    uInk: srgb(look.colors.ink),
    uPaper: srgb(look.colors.paper),
    uAccent: srgb(look.colors.accent),
  };
}

type LookValues = ReturnType<typeof lookValues>;

/** One set of uniform objects shared by every material in a viewer, so a change to the look reaches all parts at once. */
export type LookUniforms = { [K in keyof LookValues]: { value: LookValues[K] } };

export function createLookUniforms(look: DitherLook = DEFAULT_LOOK): LookUniforms {
  return Object.fromEntries(Object.entries(lookValues(look)).map(([name, value]) => [name, { value }])) as LookUniforms;
}

export function applyLook(uniforms: LookUniforms, look: DitherLook): void {
  for (const [name, value] of Object.entries(lookValues(look))) (uniforms as Record<string, { value: unknown }>)[name]!.value = value;
}

// The coordinates are wrapped before squaring so the sum stays exact on GPUs with low float precision.
const BAYER = /* glsl */ `
uniform float uMatrix;
float bayer2(vec2 p) {
  p = mod(floor(p), 2.0);
  return fract(p.x / 2.0 + p.y * p.y * 0.75);
}
float bayer(vec2 p) {
  float value = bayer2(p);
  float cells = 4.0;
  if (uMatrix > 2.5) { value += bayer2(p * 0.5) * 0.25; cells = 16.0; }
  if (uMatrix > 6.0) { value += bayer2(p * 0.25) * 0.0625; cells = 64.0; }
  return value + 0.5 / cells;
}
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
uniform float uDither;
uniform float uTones;
uniform float uToneDark;
uniform float uToneLight;
uniform float uToneCurve;
uniform vec3 uLight;
uniform float uAmbient;
uniform float uRim;
uniform float uLookContrast;
uniform float uBrightness;
uniform float uDarkColors;
uniform float uLookSpecular;
uniform vec3 uInk;
uniform vec3 uPaper;
varying vec3 vNormal;
${BAYER}
void main() {
  float threshold = bayer(gl_FragCoord.xy);
  if (uClear > 0.5 && threshold < 0.5) discard;

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float lambert = max(dot(n, uLight), 0.0);
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0) * uRim;
  float shade = uAmbient + (1.0 - uAmbient) * lambert + rim;
  float luminance = dot(uColor, vec3(0.2126, 0.7152, 0.0722));
  shade = (shade - 0.5) * uContrast * uLookContrast + 0.5 + uBias + uBrightness - uDarkColors * (1.0 - luminance);
  vec3 halfway = normalize(uLight + vec3(0.0, 0.0, 1.0));
  shade += uSpecular * uLookSpecular * pow(max(dot(n, halfway), 0.0), uShininess);
  shade = clamp(shade, 0.0, 1.0);

  float last = uTones - 1.0;
  float t = clamp(floor(shade * last + 0.5 + (threshold - 0.5) * uDither), 0.0, last) / last;
  vec3 tone = t < 0.5
    ? mix(uColor, uInk, uToneDark * pow(1.0 - 2.0 * t, uToneCurve))
    : mix(uColor, uPaper, uToneLight * pow(2.0 * t - 1.0, uToneCurve));
  gl_FragColor = vec4(tone, 1.0);
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
uniform float uShadowSoftness;
uniform float uShadowCore;
uniform vec3 uInk;
uniform vec3 uAccent;
varying vec2 vDisc;
${BAYER}
void main() {
  float d = dot(vDisc, vDisc);
  if (d > 1.0) discard;
  float strength = pow(1.0 - d, uShadowSoftness);
  float threshold = bayer(gl_FragCoord.xy);
  if (strength < threshold) discard;
  gl_FragColor = vec4(strength > uShadowCore + threshold * 0.3 ? uInk : uAccent, 1.0);
}
`;

export function createDitherMaterial(color: string, finish: Finish, look: LookUniforms): ShaderMaterial {
  const f = FINISHES[finish];
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      ...look,
      uColor: { value: srgb(color) },
      uContrast: { value: f.contrast },
      uBias: { value: f.bias },
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

/** The look's shadow, or with `stops` (up to 6, centre colour first) a dithered gradient glow. */
export function createShadowMaterial(look: LookUniforms, stops?: readonly string[]): ShaderMaterial {
  const base = { vertexShader: shadowVertexShader, toneMapped: false, depthTest: false, depthWrite: false };
  if (!stops || stops.length < 2) return new ShaderMaterial({ ...base, fragmentShader: shadowFragmentShader, uniforms: look });
  const colours = stops.slice(0, 6).map(srgb);
  while (colours.length < 6) colours.push(colours[colours.length - 1] as Vector3);
  return new ShaderMaterial({
    ...base,
    fragmentShader: gradientShadowFragmentShader,
    uniforms: { ...look, uStops: { value: colours }, uCount: { value: Math.min(stops.length, 6) } },
  });
}
