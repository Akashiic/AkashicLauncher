/** Shaders GLSL da cena. Cores sempre chegam por uniforms (lidas do tema). */

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }
`

/** Energia do portal: redemoinho em pixel-art (16 px por bloco), HDR para o bloom. */
export const portalShader = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragment: /* glsl */ `
    uniform float uTime;
    uniform float uIntensity;
    uniform vec2 uPixels;
    uniform vec3 uDeep, uMid, uBright, uHot;
    varying vec2 vUv;
    ${NOISE}
    void main() {
      vec2 uv = (floor(vUv * uPixels) + 0.5) / uPixels; // pixelado
      vec2 p = uv - 0.5;
      p.x *= uPixels.x / uPixels.y;
      float r = length(p);
      float a = atan(p.y, p.x);
      float swirl = fbm(vec2(a * 1.6 + r * 5.0 - uTime * 0.35, r * 7.0 - uTime * 1.1));
      float streak = fbm(vec2(uv.x * 5.0, uv.y * 2.0 - uTime * 0.7));
      float n = clamp(swirl * 0.65 + streak * 0.55, 0.0, 1.0);
      vec3 col = mix(uDeep, uMid, smoothstep(0.25, 0.6, n));
      col = mix(col, uBright, smoothstep(0.55, 0.8, n));
      col = mix(col, uHot, smoothstep(0.78, 0.95, n));
      // brilho mais forte nas bordas do vão (energia contida pela moldura)
      vec2 e = min(uv, 1.0 - uv);
      float edge = 1.0 - smoothstep(0.0, 0.12, min(e.x, e.y));
      float sparkle = step(0.985, hash(floor(vUv * uPixels) + floor(uTime * 6.0)));
      vec3 outc = col * (0.9 + n * 1.6 + edge * 1.4) + uHot * sparkle * 2.0;
      gl_FragColor = vec4(outc * uIntensity, 1.0);
    }
  `,
}

/** Coluna de luz que sobe do portal (falsa luz volumétrica). */
export const beamShader = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalV;
    varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormalV = normalize(normalMatrix * normal);
      vViewDir = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragment: /* glsl */ `
    uniform float uTime;
    uniform float uIntensity;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vNormalV;
    varying vec3 vViewDir;
    ${NOISE}
    void main() {
      float facing = abs(dot(vNormalV, vViewDir));
      float soft = pow(facing, 2.5);
      float fade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.25, 1.0, vUv.y));
      float flick = 0.75 + 0.25 * fbm(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * 0.6));
      float a = soft * fade * flick * uIntensity;
      gl_FragColor = vec4(uColor * a, a);
    }
  `,
}

/** Mar de névoa sob a ilha: fbm animado, mistura normal com baixa opacidade. */
export const fogShader = {
  vertex: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragment: /* glsl */ `
    uniform float uTime;
    uniform float uOpacity;
    uniform vec3 uColor;
    uniform vec2 uDrift;
    varying vec2 vUv;
    ${NOISE}
    void main() {
      vec2 p = vUv * 4.0 + uDrift * uTime;
      float n = fbm(p + fbm(p * 0.7 + uTime * 0.02));
      float radial = 1.0 - smoothstep(0.15, 0.5, length(vUv - 0.5));
      float a = smoothstep(0.35, 0.85, n) * radial * uOpacity;
      gl_FragColor = vec4(uColor, a);
    }
  `,
}

/** Céu: degradê vertical com brilho vinho no horizonte. */
export const skyShader = {
  vertex: /* glsl */ `
    varying vec3 vPos;
    void main() { vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragment: /* glsl */ `
    uniform vec3 uTop, uHorizon;
    varying vec3 vPos;
    void main() {
      float h = vPos.y;
      float glow = exp(-abs(h + 0.04) * 4.5);
      vec3 col = mix(uTop, uHorizon, glow);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

/** Brasas e cinzas subindo (pontos com brilho suave). */
export const emberShader = {
  vertex: /* glsl */ `
    uniform float uTime;
    uniform float uHeight;
    uniform float uPixelRatio;
    attribute float aSeed;
    attribute float aSpeed;
    attribute float aSize;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec3 p = position;
      float t = uTime * aSpeed + aSeed * 50.0;
      float life = fract(t / uHeight);
      p.y += life * uHeight;
      p.x += sin(t * 0.6 + aSeed * 6.28) * 0.8;
      p.z += cos(t * 0.45 + aSeed * 3.1) * 0.6;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uPixelRatio * (60.0 / -mv.z);
      vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.6, 1.0, life)) * (0.6 + 0.4 * sin(t * 3.0 + aSeed * 20.0));
      vColor = aColor;
    }
  `,
  fragment: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      a = a * a * vAlpha;
      gl_FragColor = vec4(vColor * a * 2.2, a);
    }
  `,
}

/** Pós-processamento de cinema: aberração cromática, vinheta e granulado. */
export const gradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: [1, 1] },
    uAberration: { value: 0.0035 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.018 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAberration;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uAberration * 4.0;
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, base.g, texture2D(tDiffuse, vUv - off).b);
      float vig = smoothstep(0.85, 0.2, length(d * vec2(1.0, 1.15)));
      col *= mix(1.0 - uVignette, 1.0, vig);
      float g = hash(vUv * uResolution + fract(uTime * 7.31) * 100.0) - 0.5;
      col += g * uGrain * (0.35 + 0.65 * (1.0 - vig * 0.6));
      gl_FragColor = vec4(max(col, 0.0), base.a);
    }
  `,
}
