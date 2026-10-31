/*

Created by Tonny Espeset, 2026
https://dittytoy.net/ditty/2dd99fc839

80s hits: Take On Me, the Dittytoy port of my Shadertoy sound shader
https://www.shadertoy.com/view/fXc3RB

Feel free to use the instruments and the song, but please keep this credit and link.

*/

ditty.bpm = 60;

// the mix, as in the shader: one loop per instrument, in the shader's track order
const MASTER = .475, CHOIR_UPPER = 1.06, MIX = { 'kick': .59, 'backbeat': 1.22, 'low tom': 1.16, 'brush accents': 1.07, 'dx7 bass': .87, 'bells': 1.6, 'orbit pluck': 1.6, 'juno bell pair': 1.64, 'juno low pluck': 1.46, 'atmosphere': 1.32, 'glassy pad': .92, 'warm pad': .68, 'verse keys': .94, 'string ensemble': 1.01, 'fm keys': .52, 'lead vocal': 1.2, 'backing octaves': 1.12, 'choir': 1, 'bridge strings': .56, 'bridge plucks': 1.5 };

// helpers: maths, the data strings, the score's timing and notes, and a few DSP tools
const { sin, cos, exp, sqrt, floor, round, min, max, abs, log, log2, tanh, imul, PI } = Math, TAU = 2 * PI, SR = ditty.sampleRate;
// the site halves the sum of the loops, hence M
const M = 2 * MASTER, ss = (a, b, x) => (x = clamp((x - a) / (b - a), 0, 1), x * x * (3 - 2 * x)), hz = midi_to_hz;
const rnd = n => (n >>>= 0, n ^= n >>> 16, n = imul(n, 0x7feb352d), n ^= n >>> 15, n = imul(n, 0x846ca68b), ((n ^ n >>> 16) >>> 8) / 8388608 - 1);
// data strings carry 13 bits in two characters
const bytes = s => {
  const o = [], d = c => c - 32 - (c > 39) - (c > 92);
  for (let i = 0, a = 0, n = 0; i < s.length; i += 2, a &= (1 << n) - 1) for (a = a << 13 | d(s.charCodeAt(i)) * 91 + d(s.charCodeAt(i + 1)), n += 13; n >= 8;) o.push(a >> (n -= 8) & 255);
  return new Uint8Array(o);
};
// score ticks (24 a beat) to seconds, and the record's fade
const T = k => (k /= 24, .39838576 + min(k, 368) * .35482526 + max(k - 368, 0) * .35409087);
const fade = t => (t %= 229) < 207.4 ? 1 : 2 ** (-.3737 * (t - 207.4)) * ss(228.5, 227, t);
// the score: LZ-packed columns per track (SPEC: count, then per column -1 bytes, -2 16 bits or a constant)
function unlz(b) {
  const o = [];
  for (let i = 0; i < b.length;) {
    let t = b[i++];
    if (t < 128) for (t++; t--;) o.push(b[i++]);
    else for (let d = b[i++] + b[i++] * 256 + 1, n = t - 125; n--;) o.push(o[o.length - d]);
  }
  return o;
}
let tracks;
const track = i => (tracks ||= SPEC.map(((S, p) => ([n, ...f]) => {
  const c = f.map(x => Array.from({ length: n }, () => x >= 0 ? x : x == -1 ? S[p++] : S[p++] + 256 * S[p++]));
  let k = 0;
  return c[0].map((d, i) => [k += d, c[1][i], c[2][i], c[3][i], c[4][i], c[5][i]]);
})(unlz(bytes(SCORE)), 0)))[i];
// the shader's note scan skips one note past each finished one, and the approved audio has those gaps: replay it
function gaps(notes, flat) {
  if (notes.done) return notes;
  notes.done = 1;
  const cues = [], old = max(...notes.map(n => n[4])) * .35482526 / 24 + .001;
  notes.forEach(n => flat || n[2] || !cues.length ? cues.push([n]) : cues[cues.length - 1].push(n));
  let lo = 0;
  for (const k of [...new Set(notes.flatMap(n => [n[0], n[0] + n[4]]))].sort((a, b) => a - b)) {
    while (lo < cues.length && cues[lo][0][0] <= k) lo++;
    const on = new Set();
    for (let step = 16, skip = 0; ; step++) {
      const i = lo - 1 - (step - 16) - skip;
      if (i < 0 || step + skip >= (flat ? 112 : 26) || T(k) - T(cues[i][0][0]) > (flat ? old : 13)) break;
      for (const n of cues[i]) n[0] <= k && k < n[0] + n[4] ? on.add(n) : skip++;
    }
    for (const n of notes) if (n[0] <= k && k < n[0] + n[4] && on.has(n) == !!n.out) (n.fl ||= []).push(k - n[0]), n.out = !n.out;
  }
  return notes;
}
// plays the shader's track i (seconds, squared velocity); a note stops at its last gap or where the song has faded out; rewinds after
function play(syn, i, opt) {
  let now = 0;
  for (const n of gaps(track(i), i != 4 && i != 7)) {
    const [k, m, v, g, l, a] = n, t = (round(T(k) * SR) - .5) / SR, fl = (n.fl || []).map(f => T(k + f) - T(k)), life = T(k + l) - T(k);
    sleep(t - now);
    syn.play(m, { env: one, life, duration: min(fl.length % 2 ? fl.pop() : life, 228.5 - T(k)), gate: T(k + g) - T(k), v: (v / 127) ** 2, aux: a, k, amp: fl.length ? t => fl.reduce((on, f) => t >= f ? 1 - on : on, 1) : 1, ...opt });
    now = t;
  }
  sleep(-now);
}
// an instrument is a loop named as in the mix; f schedules one pass of the song, played at the mix level with the record's fade
function instrument(name, f, bus, gain = fade) {
  const g = MIX[name], l = loop(() => { f(); sleep(229); }, { name, amp: bus ? g : t => M * g * gain(t) });
  if (bus) l.connect(bus);
}
// a note's slow values: f(age) every 16 samples, ramped in between
function ctl(s, t, f) {
  if (s.c) for (let k = 0; k < s.c.length; k++) s.c[k] += s.d[k]; else s.c = f(t), s.n = 0;
  if (s.n++ % 16 == 0) s.d = f(t + 16 / SR).map((x, k) => (x - s.c[k]) / 16);
  return s.c;
}
// wavetables: one period of sum a[k] sin(2 pi k u + p[k])
function wave(a, p = [], n = 2048) {
  const w = new Float32Array(n + 1);
  a.forEach((ak, k) => {
    const c = cos(TAU * k / n), s = sin(TAU * k / n);
    let x = sin(p[k] || 0), y = cos(p[k] || 0);
    if (ak) for (let i = 0; i < n; i++) { w[i] += ak * x; const x1 = x * c + y * s; y = y * c - x * s; x = x1; }
  });
  w[n] = w[0];
  return w;
}
const rd = (w, u) => (u = (u - floor(u)) * (w.length - 1), w[u | 0] + u % 1 * (w[(u | 0) + 1] - w[u | 0]));
const at = (T, i, f) => T[i] + f * (T[i + 1] - T[i]), at2 = (T, i, w, a, f) => w > 1e-4 ? lerp(at(T[i], a, f), at(T[i + 1], a, f), w) : at(T[i], a, f);
const k6Env = (t, g, a, r) => (1 - exp(-t / a)) * exp(-max(t - g, 0) / r), gauss = (x, c, w) => exp(-.5 * ((x - c) / w) ** 2);

// drums: every hit of a drum is the same waveform, so it is rendered once from the shader's modal body and band-noise model
function drumWave(v) {
  const [m0, mn, n0, nn] = F1_RANGE.slice(v * 4), [tx, end, tz] = F1_TIME.slice(v * 3), w = new Float64Array(Math.ceil(end * SR));
  const env = (t, a, d, s) => t <= 0 ? 0 : (1 - exp(-t / max(a, 1e-5))) * exp(-min((t / max(d, 1e-5)) ** s, 60)), sinc = x => abs(x) < 1e-5 ? 1 : sin(PI * x) / (PI * x);
  for (let j = m0; j < m0 + mn; j++) {
    const [ax, ay, az, aw] = F1_MODE_A.slice(j * 4), [bx, by, bz, bw] = F1_MODE_B.slice(j * 4);
    for (let i = 0; i < w.length; i++) { const t = max(i / SR - tx, 0); w[i] += aw * env(i / SR - tx, bx, by, bz) * sin(TAU * (ax * t + ay * az * (1 - exp(-t / az))) + bw); }
  }
  for (let j = n0; j < n0 + nn; j++) {
    const [lo0, hi0, amp, att] = F1_NOISE_A.slice(j * 4), [dec, sh, off] = F1_NOISE_B.slice(j * 3), hi1 = v == 1 ? min(hi0, SR * .47) : hi0;
    if (lo0 >= hi1) continue;
    // a windowed-sinc band of interpolated white noise on a 24 or 48 kHz clock
    const ck = hi1 > 11700 ? 48000 : 24000, lo = clamp(lo0 / ck, 1e-4, .475), hi = clamp(hi1 / ck, lo + 1e-4, .485), seed = imul(1985 + 11 * v + j * 7919, 1013);
    const h = Array.from({ length: 33 }, (_, k) => (k -= 16, (2 * hi * sinc(2 * hi * k) - 2 * lo * sinc(2 * lo * k)) * (.42 + .5 * cos(PI * k / 16) + .08 * cos(TAU * k / 16))));
    const pw = h.reduce((p, x) => p + x * x, 0), adj = h.reduce((p, x, k) => p + (k ? x * h[k - 1] : 0), 0), r = Array.from({ length: Math.ceil(end * ck) + 36 }, (_, k) => rnd(k - 16 + seed));
    for (let i = 0; i < w.length; i++) {
      const wa = i / SR - tx - off, e = env(wa, att, dec, v == 1 ? 1 : sh) * (v == 1 ? 1 + sh * exp(-max(wa, 0) / max(tz, 1e-5)) : 1), p = i / SR * ck, n = floor(p), f = p - n;
      if (e < 1e-6) continue;
      let s = 0;
      for (let k = 0; k < 33; k++) s += h[k] * (r[n + k] + f * (r[n + k + 1] - r[n + k]));
      w[i] += amp * e * s * sqrt(3 / max(pw * ((1 - f) ** 2 + f * f) + 2 * adj * f * (1 - f), 1e-10));
    }
  }
  return w.map((x, i) => x * ss(0, .007, end - i / SR) * ss(0, .00025, i / SR) * 1.0655 * TK_GAIN[v]);
}
const drumWaves = [];
const drum = synth.def(class {
  constructor(o) { this.w = drumWaves[o.aux] ||= drumWave(o.aux); this.i = 0; }
  process(n, e, t, o) { return (this.w[this.i++] || 0) * o.v; }
}, { name: 'drum' });
instrument('kick', () => play(drum, 0));
instrument('backbeat', () => play(drum, 1));
instrument('low tom', () => play(drum, 2));
instrument('brush accents', () => play(drum, 3));

// bass: the DX7 patch with its level and rate scaling
const dx7 = synth.def(class {
  constructor(o) {
    const key = this.key = round(o.note), sc = (g, d, c) => (c < 2 ? -1 : 1) * (c == 0 || c == 3 ? g * d * 329 >> 12 : F5_EXP[min(g, 32)] * d * 329 >> 15);
    this.ops = [0, 1, 2, 3, 4, 5].map(op => {
      const k = F5_KSC.slice(op * 4), off = key - k[0] - 17, x = clamp((key / 3 | 0) - 7, 0, 31), rs = F5_RS[op], rem = x & 7;
      const ol = max(0, (min(127, F5_OUT[op] + (off >= 0 ? sc((off + 1) / 3 | 0, k[2], k[3] & 3) : sc((1 - off) / 3 | 0, k[1], k[3] >> 2))) << 5) + F5_VEL[op]);
      const q0 = (rs * x >> 3) - (rs == 3 && rem == 3) + (rs == 7 && rem > 0 && rem < 4), L = F5_LSOL.slice(op * 4, op * 4 + 4).map(l => max(16, l + ol - 4256) / 256);
      const r = F5_RATE.slice(op * 4, op * 4 + 4).map(r => (r = min(63, r + q0), (4 + (r & 3)) * 2 ** (r >> 2) * .0105133));
      return [...L, ...r, abs(L[0] - L[1]) / r[1], abs(L[1] - L[2]) / r[2]];
    });
    this.g = new Float64Array(6);
    this.w = TAU * hz(key - 12);
    this.i = 0;
  }
  process(n, e, t, o) {
    const age = this.i++ / SR, gate = o.gate, tk = min(age, gate), g = this.g, w = this.w * age;
    if (age > .6) return 0;
    for (let j = 0; j < 6; j++) {
      const p = this.ops[j], d2 = p[8], d3 = p[9];
      const l = tk < d2 ? p[0] + Math.sign(p[1] - p[0]) * p[5] * tk : tk < d2 + d3 ? p[1] + Math.sign(p[2] - p[1]) * p[6] * (tk - d2) : p[2];
      g[j] = 2 ** ((age > gate ? max(p[3], l - p[7] * (age - gate)) : l) - 14);
    }
    let o6 = g[5] * sin(w * 9);
    o6 = g[5] * sin(w * 9 + 3.14159 * o6);
    o6 = g[5] * sin(w * 9 + 3.14159 * o6);
    return g[0] * sin(w * .5 + TAU * (g[1] * sin(w * .5) + g[2] * sin(w * .5 + TAU * g[3] * sin(w * 5)) + g[4] * sin(w * .5 + TAU * o6))) * -.17476;
  }
}, { name: 'dx7' });
instrument('dx7 bass', () => play(dx7, 4));

// bells: two detuned partial sets, a lowpass closing after the strike, a decay per partial; aux is the octave
const bell = synth.def(class {
  constructor(o) {
    const s = T(o.k), oct = o.aux, f = this.f = hz(o.note - .011), det = 5.2 * (.7 + oct * .13), H = min(20, floor(min(10500, .46 * SR) / f));
    this.fc = s < 40 ? 6400 : 5530;
    this.init = ((o.note - 12 * oct) * .173 + s * .137) % 1 * TAU + oct * 1.73;
    this.ka = 2 ** (-det / 2400);
    this.kb = 2 ** (det / 2400);
    this.sh = Array.from({ length: H }, (_, h) => (h + 1) ** -.8164501 * (1 + 2.1777318 * gauss(h + 1, 3, .14)));
    this.dk = this.sh.map((_, h) => exp(-.07 * (f * (h + 1) / 1500) ** .8 / SR));
    this.dc = this.sh.map(() => 1);
    this.h4 = this.sh.map((_, h) => (h + 1) ** 4);
    this.i = 0;
  }
  process(n, e, t, o) {
    const age = this.i++ / SR, f = this.f, I = this.init, m = .43;
    if (age > o.gate + 1.25) return 0;
    const c = ctl(this, age, a => [(f / (this.fc + 2400 * exp(-a / .07))) ** 4, cos(TAU * 4.42 * a + I), cos(TAU * 6.03 * a + I + 1.1), k6Env(a, o.gate, .0055, .165) * exp(-a / 9.5)]);
    const xa = TAU * f * (age * this.ka + 13.5 * .00057762265 / (TAU * 4.42) * (cos(I) - c[1])) + .11, xb = TAU * f * (age * this.kb + 8 * .00057762265 / (TAU * 6.03) * (cos(I + 1.1) - c[2])) + .11;
    // sin(h x + c) over the partials by the Chebyshev recurrence
    const ca = 2 * cos(xa), cb = 2 * cos(xb);
    let a0 = 0, a1 = sin(xa), b0 = sin(1.7), b1 = sin(xb + 1.7), y = 0;
    for (let h = 0; h < this.sh.length; h++) {
      y += this.sh[h] / sqrt(1 + c[0] * this.h4[h]) * (this.dc[h] *= this.dk[h]) * ((1 - m) * a1 + m * b1);
      const a2 = ca * a1 - a0, b2 = cb * b1 - b0;
      a0 = a1; a1 = a2; b0 = b1; b1 = b2;
    }
    return y / sqrt((1 - m) ** 2 + m * m) * o.v * TK_GAIN[5] * c[3];
  }
}, { name: 'bell' });
instrument('bells', () => play(bell, 5));

// orbit pluck: an arpeggiated pluck figure with quarter-note echoes and early reflections, one note per clip
const FXF = [0, 1, 2, 3, 4, 5, 6, 7].map(d => hz(80 - d)), FXW = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(h => h ** -1.148513);
const FX = [[8064, 16, 128, [.018198, .020713, .01326, .015362, .020599, .055506]], [9985, 8, 31, [.006129, .015353, .022254, .021035, .038608, .078348]]];
const orbit = synth.def(class {
  constructor(o) {
    const [k, z, w, fade] = FX[o.aux];
    Object.assign(this, { step: (k < 8832 ? .35482526 : .35409087) / 4, z, w, fade, b: new Float64Array(1 << 17), i: 0 });
    this.len = this.step * z * 8;
  }
  core(u) {
    const { step, z, w, len } = this;
    if (u < 0 || u > len + 1.1) return 0;
    const top = min(floor(u / step), z * 8 - 1), fc = 6612.2725 * (1 + .28 * sin(TAU * .19 * u + .4)), lfo = .00082 * sin(TAU * 4.42 * u + 1.3);
    let body = 0, up = 0;
    for (let j = top; j >= 0 && j > top - 24; j--) {
      const slot = j % 8, desc = j >= w, f = FXF[desc ? (j - w) % 4 : min(slot, 7 - slot)], bg = step * (!desc && (slot == 3 || slot == 7) ? 2 : 1), age = u - j * step;
      if (age > max(step, bg) + .9) break;
      if (age < 0) continue;
      const ph = f * age + (j * .61803398875 + .37) % 1, e08 = exp(-age / .08), env = k6Env(age, step, .001881, .026) * (.514885 + .485115 * e08);
      if (desc || !(slot == 4 || (slot == 0 && j > 0))) body += k6Env(age, bg, .007, .17) * exp(-age / 5) * sin(TAU * ph);
      if (env < 1e-5) continue;
      const m = .62 * (1 - e08), pick = 1.190836 * exp(-age / .030297), xa = 2 * TAU * ph + .3, xb = 2 * TAU * (ph - f * lfo) * 2 ** (-2.7 / 1200) + .3;
      const ca = 2 * cos(xa), cb = 2 * cos(xb);
      let a0 = 0, a1 = sin(xa), b0 = 0, b1 = sin(xb), v = 0;
      for (let h = 1; h <= 8; h++) {
        const x = 2 * h * f / fc;
        v += FXW[h] * (1 + pick * (1 - 1 / h)) / sqrt((1 - x * x) ** 2 + x * x / .49) * clamp((min(11000, SR * .46) - 2 * h * f) / 800, 0, 1) * ((1 - m) * a1 + m * b1);
        const a2 = ca * a1 - a0, b2 = cb * b1 - b0;
        a0 = a1; a1 = a2; b0 = b1; b1 = b2;
      }
      up += .873044 * v * env / sqrt((1 - m) ** 2 + m * m);
    }
    return up * exp(-max(u - len, 0) / .035) + body * exp(-max(u - len, 0) / .145);
  }
  process() {
    const i = this.i++, u = i / SR, len = this.len, b = this.b, P = [0, .12, .35, .6, .78, 1], x = clamp(u / len, 0, 1);
    if (u > len + 1.5) return 0;
    b[i & 131071] = this.core(u);
    let echo = 0, j = 0;
    for (let k = 1; k < 7; k++) {
      const d = round((k <= 3 ? k * 4 * this.step : .037 + .071 * (k - 3) ** 1.32) * SR);
      if (i >= d) echo += (k <= 3 ? .22 * .38 ** (k - 1) : .07 * .66 ** (k - 4)) * b[(i - d) & 131071];
    }
    while (j < 4 && x >= P[j + 1]) j++;
    return (b[i & 131071] + echo * exp(-max(u - len, 0) / .032)) * lerp(this.fade[j], this.fade[j + 1], (x - P[j]) / (P[j + 1] - P[j]));
  }
}, { name: 'orbit' });
instrument('orbit pluck', () => FX.forEach(([k], i) => { const t = (round(T(k) * SR) - .5) / SR; sleep(t); orbit.play(80, { env: one, duration: 30, aux: i }); sleep(-t); }));

// Juno: the shader's additive patch as wavetables per pitch and filter level, its room's wobbling phases every 50 ms
const junoTabs = {};
function junoTab(m, lay) {
  const bell = lay != 1, f0 = hz(m), sub = bell ? .15 : .5, H2 = 2 - .95 * .49, pw = .5 - .45 * .49, hc = bell ? 412 : 1220, cv = .46 * 200 / 12 + 4 * (m - 60) / 60 + .05, K = floor(36000 / f0);
  const lp = (f, fc) => (f /= fc, 1 / sqrt((1 - f * f) ** 2 + f * f / .49)), hp = f => (f /= hc, f / sqrt(1 + f * f));
  const set = (fn, n = K) => Array.from({ length: n + 1 }, (_, k) => k ? fn(k, .5 * f0 * k) : 0), lev = [0, 1, 2, 3, 4].map(l => 7.8 * 2 ** (cv + .3 * l)), fr = 7.8 * 2 ** (cv + .36);
  const rph = k => RPH[k - 1] / 256 * TAU, x = f => clamp(log2(f / 300) / 3.5, 0, 1);
  const room = o => Array.from({ length: 49 }, (_, i) => wave(set((k, f) => ((k & 1) == o) * lp(f, fr) * hp(f) * ss(120, 320, f) * exp(-i * .05 / lerp(1.3, 1, x(f))) *
    (k & 1 ? 2 * sub / k : (1 + H2 * abs(bell * sin(PI * k / 2 * pw))) / (k / 2))), set(k => rph(k) + 2.5 * sin(i * .05 * (1.7 + rph(k) % 1 * 2.6) + 3 * rph(k))), 512));
  return junoTabs[m * 3 + lay] ||= {
    saw: lev.map(fc => wave(set((k, f) => k & 1 ? 0 : -lp(f, fc) * hp(f) / (k / 2)))),
    sub: lev.map(fc => wave(set((k, f) => k & 1 ? -lp(f, fc) * hp(f) * 2 * sub / k : 0))),
    pul: bell && lev.map(fc => wave(set((n, f) => -lp(2 * f, fc) * hp(2 * f) * H2 * sin(PI * n * pw) / n, K >> 1), set(n => PI / 2 - PI * n * pw, K >> 1))),
    room: [room(1), room(0)]
  };
}
// the Juno envelope: attack toward 1.632, then 41:1 decays over d and after the gate over r
const JA = log(1.632 / .632) / .0184, JT = log(1.632) / JA, L41 = log(41);
const junoEnv = (t, g, d, r) => { const h = min(t, g), l = min(1, h < JT ? 1.632 * (1 - exp(-JA * h)) : exp(-L41 * (h - JT) / d)); return t <= g ? l : l * exp(-L41 * (t - g) / r); };
// a riff note's layers: 0 the patch and 2 a thin one an octave up (juno 1), 1 a pluck an octave down (juno 2); aux is the seed
const juno = synth.def(class {
  constructor(o) {
    this.seed = o.aux / 256;
    this.L = o.layers.map(l => {
      const m = o.note + [0, -12, 12][l], bell = l != 1;
      return { tab: junoTab(m, l), bell, f: hz(m) * (l == 2 ? 2 ** (14 * (2 * ((this.seed * 3.71 + .13) % 1) - 1) / 1200) : 1), g: [1, 5.2, .7][l] * .0515, d: bell ? 2.37 : .2736, r: bell ? .4512 : .2292, rv: bell ? .14 : .056 };
    });
    this.i = 0;
  }
  process(n, e, t, o) {
    const age = this.i++ / SR, ri = min(47, age / .05 | 0), rw = age / .05 - ri;
    if (age > 2.4) return 0;
    const c = ctl(this, age, a => this.L.flatMap(L => {
      const env = junoEnv(a, o.gate, L.d, L.r), sa = junoEnv(a, o.gate, .0866, L.r), rv = L.rv * (1 - exp(-a / .06));
      return [env, junoEnv(a, o.gate, .1848, .1848) * 4, sa, rv * sa / max(env, 1e-6), rv, rv * exp(-a / 1.3)];
    }));
    let y = 0;
    for (let l = 0, j = 0; l < this.L.length; l++, j += 6) {
      if (c[j] < .0005 && c[j + 5] < .0005) continue;
      const L = this.L[l], tb = L.tab, i = min(3, c[j + 1] | 0), w = c[j + 1] - i, u = (L.f * age + .1) / 2 % 1, R = tb.room;
      const p = u * 2048, a = p | 0, fa = p - a, q = u * 512, b = q | 0, fb = q - b;
      let s = c[j] * at2(tb.saw, i, w, a, fa) + c[j + 2] * at2(tb.sub, i, w, a, fa) + c[j + 3] * lerp(at(R[0][ri], b, fb), at(R[0][ri + 1], b, fb), rw) + c[j + 4] * lerp(at(R[1][ri], b, fb), at(R[1][ri + 1], b, fb), rw);
      if (L.bell) { const v = (L.f * 1.005096 * age + this.seed) % 1 * 2048, e = v | 0; s += c[j] * at2(tb.pul, i, w, e, v - e); }
      y += L.g * s;
    }
    return y;
  }
}, { name: 'juno' });
// both Juno loops share the chorus: two dulled BBD taps swept by a .863 Hz triangle, then the bus saturation
const chorus = filter.def(class {
  constructor() { this.b = new Float64Array(1024); this.n = 0; this.z = [0, 0, 0, 0]; this.k = [7237, 10644].map(f => Math.tan(PI * f / SR)); }
  process(x) {
    const n = this.n++, t = n / SR, lfo = 4 * abs(t * .863 % 1 - .5) - 1, z = this.z, f = M * fade(t);
    let v = x[0];
    for (let j = 0; j < 2; j++) { const k = this.k[j]; v = (k * (v + z[2 * j]) + (1 - k) * z[2 * j + 1]) / (1 + k); z[2 * j] = j ? z[1] : x[0]; z[2 * j + 1] = v; }
    this.b[n & 1023] = v;
    const tap = d => this.b[(n - round(d * SR)) & 1023];
    return [tanh(1.4 * (.44 * x[0] + .56 * tap(.003345 + lfo * .001805))) * f, tanh(1.4 * (.44 * x[0] + .56 * tap(.003455 - lfo * .001945))) * f];
  }
}, { name: 'juno chorus' });
const junoBus = chorus.createShared();
instrument('juno bell pair', () => play(juno, 7, { layers: [0, 2] }), junoBus);
instrument('juno low pluck', () => play(juno, 7, { layers: [1] }), junoBus);

// pads: three detuned drifting oscillators a note, a wavetable per level of the high partials' fade; aux is the patch
const PATCH = [[.2877135, 4.5, .019, 4.4, .6, 1.06, 10, .61, 2.06, 9.3, 4.17, 3.3, 7.5, .045, .19, .46], [.2455979, -3.7, .08, 2.5, .78, .39, 3.8, .43, .59, 1.1, 4.18, .28, 1.2, .055, .02, .85],
  [.3105146, -3.7, .055, .48, .68, .27, 4.5, .44, .59, 1.5, 4.18, .28, 1.2, .055, .06, .8], [.3280919, -3.7, .11, 4, .91, .44, 6.7, .8, .82, 5.5, 4.18, .9, 1.2, .055, .014, .9]];
const CEIL = min(14000, .46 * SR), band = f => clamp((CEIL - f) / (CEIL * .08), 0, 1);
function padPartial(l, m, h) {
  const f = h * hz(m), even = h % 2 < .5, one = l == 1, pu = sin(PI * h * clamp(.115519 - .0023351 * (m - 73), .03, .49));
  return band(f) * (l == 0 ? h ** -.15 * (even ? .8984815 : 1) * (1 + 5.1648574 * gauss(h, 1.5809937, .2745189)) * (.6601429 + .3398571 * (pu * pu + .005)) *
      (1 + 2.2855227 * gauss(log2(f / 2062.1763), 0, .1300339)) / sqrt(1 + (f / 1300.0624) ** 4) :
    l == 3 ? h ** -.93 * (even ? .56 : 1) / sqrt(1 + (f / 3000) ** 4) / sqrt(1 + (145 / f) ** 2) :
    h ** -lerp(one ? 2.3 : 2.05, one ? 1.45 : 1.25, clamp((m - 44) / 12, 0, 1)) / sqrt(1 + (f / (one ? 2200 : 1650)) ** 4) * (1 + (10 ** ((one ? 7 : 4) / 20) - 1) * gauss(log2(f / 295), 0, .43)) * (even ? one ? 1.4 : 1.15 : 1));
}
const DECAY = [0, .01, .02, .04, .08, .16, .32, .64, 1.28, 2.56, 5.12], padTabs = {};
const pad = synth.def(class {
  constructor(o) {
    const l = this.l = o.aux, m = o.note, p = this.p = PATCH[l];
    this.i = this.k = 0;
    if (l == 4) {
      const b = hz(m + .0401876);
      this.f = [-9.371223, -2.963397, 2.963397, 9.371223].map(c => b * 2 ** (c / 1200));
      this.amp = Array.from({ length: 49 }, (_, h) => h && band(h * hz(m)) * h ** -.534233 * (h % 2 < .5 ? 2.305448 : 1) * (.676941 + .323059 * abs(sin(PI * h * .268694))) / sqrt(1 + (h / (4.435344 * 2 ** (-.257367 * (m - 73) / 12))) ** 8));
      this.att = this.amp.map((_, h) => h && exp(-1 / SR / (.00737 + .005 / h ** 3)));
      this.dmp = this.amp.map((_, h) => exp(-.431165 / SR * max(0, h - 1) ** .693174));
      this.a = this.amp.map(() => 1);
      this.d = this.amp.map(() => 1);
      this.t0 = T(o.k);
      return;
    }
    const rm = l == 1 || l == 2 ? lerp(.2, 1, clamp((m - 40) / 22, 0, 1)) : 1, f = hz(m + p[1] / 100), sp = TAU * ((m * .61803398875 + 2.941 + l * .137) % 1);
    this.f = [-1, 0, 1].map(d => f * 2 ** (d * p[6] * rm / 1200));
    this.ph = [-1.173, 0, 1.317].map(d => sp + d);
    const sl = this.ph.map((x, i) => x + [.23, 0, -.34][i]);
    this.cs = sl.map(cos); this.sn = sl.map(sin); this.cv = this.ph.map(x => cos(x * .71)); this.sv = this.ph.map(x => sin(x * .71));
    this.mo = this.f.map(f => f * (2 ** (p[9] * rm / 1200) - 1) / p[8]);
    this.vi = this.f.map(f => f * (2 ** (p[11] * rm / 1200) - 1) / p[10]);
    this.se = this.f.map(f => TAU * f * (2 ** (p[12] / 1200) - 1) * p[13]);
    this.side = p[7] * rm;
    const amp = Array.from({ length: 49 }, (_, h) => h && padPartial(l, m, h));
    this.norm = p[0] / sqrt(amp.reduce((s, a) => s + a * a, 0) * (1 + 2 * this.side ** 2));
    this.tab = padTabs[m * 4 + l] ||= DECAY.map(d => wave(amp.map((a, h) => a * (p[15] + (1 - p[15]) * exp(-d * (h - 1)))), [], 1024));
  }
  process(n, e, t, o) {
    const age = this.i++ / SR, p = this.p;
    if (this.l == 4) return this.air(age, o);
    const c = ctl(this, age, a => {
      const h = min(a, o.gate);
      return [(1 - exp(-h / p[2])) * (p[4] + (1 - p[4]) * exp(-h / p[3])) * exp(-max(a - o.gate, 0) / p[5]) * ss(0, .014, o.life - a), cos(TAU * p[8] * a), sin(TAU * p[8] * a), cos(TAU * p[10] * a), sin(TAU * p[10] * a), 1 - exp(-a / p[13])];
    });
    const d = age * p[14];
    while (this.k < 9 && d >= DECAY[this.k + 1]) this.k++;
    const k = this.k, w = min(1, (d - DECAY[k]) / (DECAY[k + 1] - DECAY[k]));
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const u = this.f[i] * age % 1 + (this.ph[i] + this.mo[i] * (this.cs[i] - c[1] * this.cs[i] + c[2] * this.sn[i]) + this.vi[i] * (this.cv[i] - c[3] * this.cv[i] + c[4] * this.sv[i]) + this.se[i] * c[5]) / TAU;
      y += (i == 1 ? 1 : this.side) * lerp(rd(this.tab[k], u), rd(this.tab[k + 1], u), w);
    }
    return y * this.norm * c[0] * o.v;
  }
  // the atmosphere: four carriers, each partial with its own attack and damping
  air(age, o) {
    const c = age + this.t0, s = [], tc = [], pr = [0, 0, 0, 0];
    this.f.forEach((f, i) => {
      const r = i < 2 ? 2.164323 : 4.323772, ph = TAU * ((f * c + [0, .6707402, .5357259, .4566458][i]) % 1) + f * (2 ** ((i < 2 ? 5.43689 : 8.972899) / 1200) - 1) / r * sin(TAU * (r * c + (i < 2 ? .1813177 : .0328645))) +
        TAU * f * (2 ** (4 / 1200) - 1) * .035 * (1 - exp(-age / .035));
      s[i] = sin(ph);
      tc[i] = 2 * cos(ph);
    });
    let y = 0;
    for (let h = 1; h <= 48; h++) {
      const a = this.amp[h] * (1 - (this.a[h] *= this.att[h])) * (this.d[h] *= this.dmp[h]);
      for (let i = 0; i < 4; i++) { y += a * s[i] * (i < 2 ? 1 : 1.033966); const x = tc[i] * s[i] - pr[i]; pr[i] = s[i]; s[i] = x; }
    }
    return y / sqrt(2 + 2 * 1.033966 ** 2) * .1189201 * o.v * exp(-max(age - o.gate, 0) / 1.212509) * ss(0, .014, o.life - age);
  }
}, { name: 'pad' });
// the pads rest from 131.2 to 136.5 s
const padRest = t => fade(t) * (t % 229 > 131.07 && t % 229 < 136.54 ? clamp((131.18 - t % 229) / .11, 0, 1) : 1);
instrument('atmosphere', () => play(pad, 9), 0, padRest);
instrument('glassy pad', () => play(pad, 10), 0, padRest);
instrument('warm pad', () => play(pad, 11), 0, padRest);
instrument('verse keys', () => play(pad, 12), 0, padRest);
instrument('string ensemble', () => play(pad, 13), 0, padRest);

// FM keys: a small FM electric piano
const fm = synth.def(class {
  constructor(o) { this.w = TAU * hz(o.note); this.i = 0; }
  process(n, e, t, o) {
    const age = this.i++ / SR, w = this.w * age;
    if (age > .55) return 0;
    const c = ctl(this, age, a => [(1 - exp(-a / .045)) * (.02758 + .97242 * exp(-a / .03147)) / (1 + exp((a - max(o.gate, .09)) / .03)), .2 * exp(-a / .068693), 2.211414 * exp(-a / .05), 4.16848 * exp(-a / .012477)]);
    return (sin(w + c[1] * sin(w * .5) + c[2] * sin(w * 2) + c[3] * sin(w * 7)) + .115546 * sin(w * .5)) * c[0] * o.v * 2.149943;
  }
}, { name: 'fm' });
instrument('fm keys', () => play(fm, 14));

// vocals: the shader's codec, 5 ms records of shape, pitch and gain driving 72 harmonics and 12 noise bands
let VW;
const vw = () => VW ||= new Uint32Array(bytes(VOCAL).buffer, 0, 6156), CB = 5092, ANCH = 5988;
// kind 0 records are words, kinds 1 (pitch) and 2 (gain) 21 bits from word 3131
const rec = (kind, i) => { const w = vw(), b = 3131 * 32 + i * 21, j = b >> 5, s = b & 31; return kind ? (w[j] >>> s | (s && w[j + 1] << 32 - s)) & 0x1fffff : w[i]; };
const vf = r => 60 * 2 ** ((r >> 8 & 4095) * 4.1963972128035 / 4095);
// a shape code's 32 levels in dB; book 0 lead, 1 repair, 2 backing
const shapes = new Map();
const shape = (book, code, key = book * 16777216 + code) => shapes.get(key) || shapes.set(key, Float64Array.from({ length: 32 }, (_, k) => {
  const st = k >> 3, e = code >>> st * 6 & 63, w = vw();
  return book == 1 ? (w[CB + 256 + (st * 64 + e) * 2 + (k >> 2 & 1)] >>> (k & 3) * 8 & 255) / 3 - 80 : (w[CB + (book ? 768 + st * 32 + e : st * 64 + e)] >>> (k & 7) * 4 & 15) * 4 - 60;
})).get(key);
// a stream in time order: records a, b around now, u between; pitch integrates its phase
class Stream {
  constructor(kind, start, count, t0 = 0, ph = 0) { Object.assign(this, { kind, start, count, t0, p0: ph }); this.seek(); }
  seek() { this.j = 1; this.t = this.t0; this.ph = this.p0; this.a = rec(this.kind, this.start); this.b = rec(this.kind, this.start + min(1, this.count - 1)); }
  at(now) {
    if (now < this.t) this.seek();
    for (let d; this.j < this.count - 1 && now >= this.t + (d = (this.a & 255) * .005);) {
      if (this.kind == 1) this.ph += .5 * (vf(this.a) + vf(this.b)) * d;
      this.t += d;
      this.a = this.b;
      this.b = rec(this.kind, this.start + ++this.j);
    }
    const h = (this.a & 255) * .005, d = clamp(now - this.t, 0, h), f0 = vf(this.a), f1 = vf(this.b);
    this.u = h > 0 ? d / h : 1;
    if (this.kind == 1) this.f = lerp(f0, f1, this.u), this.phase = this.ph + f0 * d + .5 * (f1 - f0) * d * this.u;
    return this;
  }
}
// noise bands: centre, width, rate, rounded as the shader does
const NB = Array.from({ length: 12 }, (_, j) => {
  const lo = 700 * (exp(.1 + j * .2309) - 1), hi = 700 * (exp(.1 + (j + 1) * .2309) - 1), q = x => round(x * 32) / 32, bw = q(hi - lo);
  return [q(.5 * (lo + hi)), bw, q(bw * 1.4)];
}), AP = [0, .12, .5, 1];
// a voice: amplitudes every 32 samples, ramped; harmonics by the Chebyshev recurrence
class Voice {
  constructor(streams, book, seed, width = 0, choir = false, gate = true) {
    Object.assign(this, { streams, book, seed: seed >>> 0, width, choir, gate, fix: 0, n: 0 });
    ['amp', 'da', 'to'].forEach(k => this[k] = new Float64Array(84));
    ['cs', 'dc', 'sn', 'ds', 'tc', 'tsn'].forEach(k => this[k] = new Float64Array(72));
    this.nz = NB.map(() => [-1, 0, 0, 0, 0]);
  }
  // amplitudes at time tb, power-normalized to the gain
  targets(tb, f) {
    const [S, , G] = this.streams, g = G.at(tb), s = S.at(tb), code = lerp(g.a >> 8 & 127, g.b >> 8 & 127, g.u), db = code * 78 / 127 - 78, out = this.to.fill(0);
    if (this.book ? code <= 0 : db < -76.9) return this.tc.fill(0), this.tsn.fill(0);
    const A = shape(this.book, s.a >>> 8), B = shape(this.book, s.b >>> 8), u = s.u, ap0 = lerp(AP[g.a >> 15 & 3], AP[g.b >> 15 & 3], g.u), ap1 = lerp(AP[g.a >> 17 & 3], AP[g.b >> 17 & 3], g.u);
    const lvl = fr => { const x = clamp((log(1 + fr / 700) - .0887954987831) / 2.7274682869593 * 31, 0, 31), k = min(x | 0, 30); return 2 ** (lerp(lerp(A[k], B[k], u), lerp(A[k + 1], B[k + 1], u), x - k) * .166096404744); };
    let pw = 0;
    for (let k = 1; k <= 72 && k * f <= 11500; k++) {
      const fr = k * f, ny = lerp(ap0, ap1, ss(1500, 6500, fr)), a = out[k - 1] = lvl(fr) * sqrt(max(0, 1 - ny * ny)) * clamp((11500 - fr) / 600, 0, 1);
      pw += .5 * a * a;
    }
    NB.forEach(([c, bw], j) => {
      const a = lvl(c) * lerp(ap0, ap1, ss(1500, 6500, c)) * sqrt(bw / max(f, 60));
      pw += a * a;
      out[72 + j] = this.choir ? a * lerp(.8, .4, ss(1500, 6500, c)) * lerp(.4, 1, ss(-62, -42, db)) : a;
    });
    const sc = 2 ** (db * .166096404744) / sqrt(max(pw, 1e-15)) * (this.gate ? ss(0, 1, code) : 1);
    out.forEach((a, k) => out[k] = a * sc);
    // a wide voice's side: each harmonic shifted by 2 pi frac(freq * .017)
    if (this.width) for (let k = 0; k < 72; k++) { const p = TAU * ((k + 1) * f * .017 % 1); this.tc[k] = out[k] * cos(p); this.tsn[k] = out[k] * sin(p); }
  }
  // one sample at stream time now: [mid, side]
  run(now, step) {
    const P = this.streams[1].at(now), amp = this.amp, da = this.da, W = this.width;
    if (this.n++ % 32 == 0) {
      this.targets(now + step * 32, P.f);
      for (let k = 0; k < 84; k++) da[k] = (this.to[k] - amp[k]) / 32;
      if (W) for (let k = 0; k < 72; k++) this.dc[k] = (this.tc[k] - this.cs[k]) / 32, this.ds[k] = (this.tsn[k] - this.sn[k]) / 32;
    }
    const c1 = cos(TAU * (P.phase + this.fix)), c2 = 2 * c1;
    let y = 0, side = 0, cp = 1, c = c1, sp = 0, s = sin(TAU * (P.phase + this.fix));
    for (let k = 0; k < 72; k++) {
      y += (amp[k] += da[k]) * c;
      if (W) { side += (this.cs[k] += this.dc[k]) * s - (this.sn[k] += this.ds[k]) * c; const s2 = c2 * s - sp; sp = s; s = s2; }
      const c3 = c2 * c - cp;
      cp = c;
      c = c3;
    }
    // noise bands: a smoothed random amplitude on a carrier
    const sec = floor(now), fr = now - sec;
    for (let j = 0; j < 12; j++) {
      const [ce, , rate] = NB[j], z = now * rate, n = floor(z), q = this.nz[j], a = amp[72 + j] += da[72 + j], sd = this.seed + j * 7919, ph = TAU * (sec * (ce % 1) + ce * fr);
      if (q[0] != n) q[0] = n, q[1] = rnd(n + sd + 117), q[2] = rnd(n + sd + 118), q[3] = rnd(n + sd + 719), q[4] = rnd(n + sd + 720);
      const w = ss(0, 1, z - n) * 2.8431;
      y += a * (q[1] * 2.8431 + (q[2] - q[1]) * w) * cos(ph);
      if (W) side += a * (q[3] * 2.8431 + (q[4] - q[3]) * w) * sin(ph);
    }
    return [y, side];
  }
}
const streams = ([s, p, g], t0 = 0, ph = 0) => [new Stream(0, s[0], s[1], t0), new Stream(1, p[0], p[1], t0, ph), new Stream(2, g[0], g[1], t0)];

// the lead vocal: routes replay the second chorus later, repair voices sing three regions, then the soft clip
const lead = synth.def(class {
  constructor() { this.i = 0; this.rep = REPAIR.map(([, id]) => new Voice(streams(VOICES[id]), 1, (id ? id + 2 : 0) * 3533 * 97)); }
  // the base restarts from each 2 s cell's anchor, as the shader scans it
  base(st) {
    const cell = clamp(st * .5 | 0, 0, 89), bv = this.bv ||= new Voice([], 0, 0, .13652, false, false);
    if (cell != this.cell) {
      const w = vw(), bit = i => w[ANCH + 164 + (i >> 5)] >>> (i & 31) & 1;
      let rank = 0;
      for (let c = 0; c < cell; c++) rank += bit(c);
      const a = [0, 1, 2, 3].map(k => bit(cell) ? w[ANCH + rank * 4 + k] : 0), [sp, gn, pi] = a.map(x => [x & 8191, x >>> 13 & 65535]);
      bv.streams = [new Stream(0, sp[0], 2185 - sp[0], sp[1] * .005), new Stream(1, 1213 + pi[0], 747 - pi[0], pi[1] * .005, (a[2] >>> 29 | a[3] << 3) / 65536), new Stream(2, gn[0], 1213 - gn[0], gn[1] * .005)];
      this.cell = cell;
    }
    return bv;
  }
  process() {
    const samp = this.i++, time = samp / SR;
    let src = samp, frac = 0, st = time, step = 1 / SR, l = 0, r = 0;
    for (const [lo, hi, z, rt] of ROUTES) if (time >= lo && time < hi) {
      const x = (samp - round(lo * SR)) * rt;
      src = round((90.2 + z) * SR) + floor(x), frac = x % 1, st = 90.2 + z + x / SR, step = rt / SR;
      break;
    }
    if (st < 0 || st >= 180) return 0;
    const wet = clamp(REGIONS.reduce((w, [a, b]) => w + ss(a, a + .06, st) * (1 - ss(b - .06, b, st)), 0), 0, 1), mute = ss(10.2, 10.24, st) * (1 - ss(11.88, 11.92, st));
    if (wet < 1 && mute < 1 && LIVE.some(([a, b]) => st >= a * .005 - 1e-4 && st < b * .005 + 1e-4)) {
      const bv = this.base(st);
      // the shader's phase corrections
      bv.fix = PHASEFIX.reduce((v, [t, x]) => st * 200 >= t ? x : v, 0);
      const [y, sd] = bv.run(st, step), g = 1.002722349 * .29255608 * (1 - wet);
      l = (y + .13652 * sd) * g;
      r = (y - .13652 * sd) * g;
    }
    if (wet > 0) REPAIR.forEach(([on, id, lv, rt], i) => {
      const len = TEMPLEN[id] * .005, age = (src - round(on * SR / 44100) + frac) / SR * rt, y = age >= 0 && age < len ? this.rep[i].run(age, rt / SR)[0] * lv / 128 * ss(0, .06, age) * (1 - ss(len - .06, len, age)) : 0;
      l += y;
      r += y;
    });
    const k = (1 - mute) * 3.1304;
    return [tanh(l * k) / 1.3, tanh(r * k) / 1.3];
  }
}, { name: 'voice' });
instrument('lead vocal', () => { sleep(-.5 / SR); lead.play(0, { env: one, duration: 228.5 }); sleep(.5 / SR); });

// backing octaves and choir: phrases of two voices; phrase 0 is the backing track, 1 and 2 the choir, its upper voice a bit up
const phrase = synth.def(class {
  constructor(o) {
    const [first, n, len] = PHRASES[o.aux];
    this.len = len * .005;
    this.v = Array.from({ length: n }, (_, k) => { const [c0, c1, c2, seed] = BVOICES[first + k]; return [first + k, new Voice(streams([CURVES[c0], CURVES[c1], CURVES[c2]]), 2, seed * 3533 * 97, 0, first + k >= 2), k]; });
    this.i = 0;
  }
  process(n, e, t, o) {
    const age = this.i++ / SR;
    if (age >= this.len) return 0;
    let y = 0;
    for (const [voice, v, k] of this.v) if (voice || age < 1.845) y += v.run(age, 1 / SR)[0] * o.lv / 128 * (voice ? voice > 1 ? 5.995 : 4.833 : 3.399) * (o.aux && k ? CHOIR_UPPER : 1);
    return y;
  }
}, { name: 'phrase' });
function phrases(choir) {
  let now = 0;
  for (const [k, lv, ph] of BEVENTS) if (ph > 0 == choir) {
    const t = (round(T(k) * SR) - .5) / SR;
    sleep(t - now);
    phrase.play(0, { env: one, duration: min(PHRASES[ph][2] * .005, 228.5 - T(k)), aux: ph, lv });
    now = t;
  }
  sleep(-now);
}
instrument('backing octaves', () => phrases(false));
instrument('choir', () => phrases(true));

// bridge strings (aux 0, 2) and bridge plucks (aux 1): three detuned oscillators on wavetables
const hTabs = {};
const strings = synth.def(class {
  constructor(o) {
    const pl = this.pl = o.aux == 1, reg = o.aux, m = this.m = o.note, f = this.f = hz(m - .03), fc = reg == 2 ? 1700 : 3821.5425;
    const hs = fn => Array.from({ length: 49 }, (_, h) => h && h * f <= min(.47 * SR, 11000) && !(pl && h > 40) ? fn(h, h * f) : 0), base = (h, F) => (h == 1 ? 1 : 1.1946317 / h ** 1.08) / sqrt(1 + (F / 7259.2344) ** 4);
    this.tab = hTabs[m * 3 + reg] ||= (pl ? [hs(base), hs((h, F) => h % 3 ? 0 : 1.3584493 / (h / 3) ** .95 / sqrt(1 + (F / 7259.2344) ** 4)), hs((h, F) => base(h, F) * min(h, 5))] :
      [1, 1.15, 1.3, 1.45].map(c => hs((h, F) => h ** -1.1697243 / (1 + (F / (fc * c)) ** 2) * (h == 1 ? reg == 2 ? 2 : .9461312 : 1)))).map(a => wave(a, [], 1024));
    this.t0 = T(o.k);
    this.i = 0;
  }
  process(n, e, t, o) {
    const age = this.i++ / SR, g = o.gate, m = this.m, pl = this.pl, tb = this.tab;
    if (age > g + 2) return 0;
    const c = ctl(this, age, a => {
      const at = 1 - exp(-a / .015), sp = 1 - exp(-a / .06), e13 = .28775328 * exp(-a / 1.3114547), h = min(a, g), r = max(0, a - g), ph = k => k * 2.1 + m * .23;
      return [pl ? exp(-r / .55449176) : (1 - exp(-h / (o.aux == 2 ? .0585 : .045))) * (.72 + .28 * exp(-h / .8)) * exp(-r / (o.aux == 2 ? .34 : .29)) + .07 * (1 - exp(-a / .18)) * exp(-r / .58),
        at * (exp(-a / .62741244) + e13), at * (exp(-a / .5648082) + .3 * e13), at * .43058354 * exp(-a / .048), .62 * sp, exp(-a / .8) * 3,
        ...[0, 1, 2].map(k => pl ? .00013 * sp * (sin(TAU * (4.3 + k * .23) * a + ph(k)) - sin(ph(k))) : .0003 * sin(TAU * (4.4 + k * .19) * a + ph(k)))];
    });
    const k = min(2, c[5] | 0), w = c[5] - k;
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const u = this.f * 2 ** ((i - 1) * 5.5 / 1200) * (age + c[6 + i]) + i * .217 + m * .137;
      y += (pl ? c[1] * rd(tb[0], u) + c[2] * rd(tb[1], u) + c[3] * rd(tb[2], u) + .12 * c[1] * sin(PI * u) : lerp(rd(tb[k], u), rd(tb[k + 1], u), w)) * (i == 1 ? 1 : (pl ? c[4] : .63) * .5);
    }
    const time = this.t0 + age;
    return y * c[0] * o.v * (pl ? TK_GAIN[19] * .021906372 / sqrt(1 + .5 * c[4] ** 2) * (1 - ss(134.94, 135, time)) : TK_GAIN[18] * .10257193 / 1.63 * (1 - ss(132.94, 133, time)));
  }
}, { name: 'strings' });
instrument('bridge strings', () => play(strings, 18));
instrument('bridge plucks', () => play(strings, 19));

// the shader's constants and the score
const F1_RANGE = [0,3,0,4,3,8,4,5,11,6,9,3,17,3,12,5];
const F1_TIME = [.0001466,.110091,1,.01234968,.29,.001554506,.0143125,.190476,1,.0009471,.171315,1];
const F1_MODE_A = [56.521984,99.388466,.0104609,.8690204,44.66338,61.11179,.1096019,1.0628572,371.32767,-209.60164,.0202558,2.1891263,162.7338,188.70526,.0040826774,.19115098,103.71241,121.55322,.093549274,1.0821636,411.91742,-162.21484,.04109863,.035018556,460.50424,-73.43866,.09968459,1.9787202,498.4145,-115.317535,.14869969,1.999999,652.3837,-400,.0041870135,.025139695,669.2244,-42.37903,.2095768,.025192965,1184.9644,134.4754,.23038691,.2970309,99.64422,180,.188449,4.189052,81.6,180,.0282231,.073836,65.01996,166.7576,.0122735,.1315408,155.74792,141.13647,.0210719,.1503048,433.62506,340.48764,.0057907,.0559118,727.4177,242.50304,.0195523,1.3005236,203.0716,103.214134,.0046569,.365095,312.16953,189.54967,.0074404,.0615562,446.14404,220.54875,.0035873,.0302815];
const F1_MODE_B = [.0007551,.0595868,4.5,2.9198966,.0649855,.0584137,3.444767,-2.7846992,.0001963,.0012,.6540088,-.3224215,.00089470734,.03349236,.6976522,-4.0294065,4.0000014e-05,.0041050855,.5,2.8153849,4.0000014e-05,.10954456,1.7137398,.020380974,.00018706633,.008915096,3.3707933,-.39994717,.00092362484,.008690168,4.259287,2.8213234,.0015054478,.025694642,4.3937855,1.9843197,.00042528802,.05905235,.86095166,3.7250051,4.0000014e-05,.0019999999,.61707336,-.24798107,.037603,.0038055,4.5,1.6062821,.0193693,.0465669,4.5,-1.055916,7.59e-05,.0265306,.9453883,5.343179,.0091265,.0051939,.5,8.797241,7.57e-05,.0063697,4.382466,1.1947409,.0426591,.0028681,4.200931,3.7995584,.0016536,.030574,1.8733437,-.9201543,4.5e-05,.0175285,4.5,.8995458,.00017,.0457918,3.0914087,-1.1503042];
const F1_NOISE_A = [220,1700,.0999499,3e-05,1300,4800,.135186,3e-05,4500,11200,.0717348,.0012342,11500,19500,.0435345,.0012342,350,1700,.040932953,.0001132039,1600,4200,.040723957,.0004362425,4000,7800,.07270722,8.375559e-05,7500,11500,.029855778,.00037298712,11500,19500,.012064488,.00010150039,280,1500,.0691241,.0026494,1200,4200,.0232615,.0032722,4200,11200,.0446746,.0061689,300,1800,.1467507,.0063557,1500,4400,.0792241,.0020153,4000,8000,.0573453,.0006215,7500,11500,.0303134,.0025908,11500,19500,.0240286,.0025908];
const F1_NOISE_B = [.0164856,.7939996,-.0002444,.0036939,.5,-.0001783,.0087014,.5000009,-.0024331,.0087014,.5000009,-.0024331,.0836466,3.7561834,-.00052776706,.11086245,12.191938,.0011538635,.1147715,5.473175,.0005253749,.1620931,8.240093,.00020167942,.14292006,13.204054,.00043285557,.0049726,.5,-.0030856,.0124606,.5,-.006,.0104267,.5,-.006,.0178022,.5986578,-.0059922,.0371996,.6503188,-.0032914,.0851633,1.3114171,-.002508,.0828916,1.4003253,-.0049376,.0828916,1.4003253,-.0049376];
const F5_LSOL = [4032,3904,1920,0,4032,0,0,0,3392,2944,0,0,3776,1856,0,0,4032,0,0,0,3840,1792,0,0];
const F5_RATE = [60,39,10,37,63,12,0,0,56,61,20,19,57,26,4,35,63,0,0,0,60,35,15,35];
const F5_OUT = [127,108,127,121,90,113];
const F5_KSC = [36,57,14,12,41,0,0,0,0,0,0,0,0,0,0,0,52,75,0,0,0,0,0,0];
const F5_RS = [7,7,6,5,7,1];
const F5_VEL = [0,0,64,112,64,144];
const F5_EXP = [0,1,2,3,4,5,6,7,8,9,11,14,16,19,23,27,33,39,47,56,66,80,94,110,126,142,158,174,190,206,222,238,250];
const TK_GAIN = [1.0812,1.1119,3,1,1,.027360525,1,1,1,1,1,1,1,1,1,1,1,1,1.7910156,1.5498047];
const SPEC = [[603,-2,60,-1,20,20,0],[317,-2,60,-1,20,20,1],[892,-1,60,-1,20,20,2],[14,-2,60,-1,20,20,3],[662,-2,-1,-1,12,31,0],[48,-2,-1,-1,-1,-2,-1],[0,0,0,0,0,0,0],[216,-2,-1,-1,-1,-2,-1],[0,0,0,0,0,0,0],[6,-2,-1,-1,-1,-2,4],[251,-2,-1,-1,-2,-2,0],[304,-2,-1,-1,-2,-2,1],[229,-2,-1,-1,-1,-1,2],[225,-2,-1,-1,-2,-2,3],[272,-2,-1,-1,-1,38,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[10,-2,-1,-1,-2,-2,-1],[12,-2,-1,-1,-1,-1,1]];
const SCORE = '$v  d+)I j #  Bg-^"-@ N!!)0TeP%g #%g3;7pS["x  eP-oNV  )RYl  &C/> 1NN !+S :"l7O&; #%dF{ ###*. !-r+3  DrS+#TJN  g# A  B+P]#084  g),X%uWp $Pzyu !-`dK )/&"Sx- E7x!bqm(yIj8D%[-N7TpN 1Yn hN2#`qL-&y6bcBg#D 4hGW/  jbFZ7OB@8e%g1r Q & #&ifw !RHqL]By4S=,:b!N-?E U&& QHt%JyqdB[xyCXpr/L&Pju^6QVBKQ+oo;KZv*t9dBsHM[+ofqLGSDro61[|xnYA=- P<s"oN!.yx,pp:>2$=!u]7FbWxnpRi^L&jst:dRb[yR+gi`KcH1t7dsV<yRXhfrLG1Zu^6APXwHXP 0 1!* bcV"pLX elLML1Vu]dsbfDq #u %Z%c_s XbQyS,:Y9N"Bi!ZN!(6xp9I!G*o !rr(u"p7O etwL&SDw&cn]()I,B:>!5jormeXBh e $ p 1.2 bk_ &xoB1^N1r .xLdsVO/& ,foN_Bg&<6rPcz9&h!F/&%d:> yPgwHAuoCCK gw&6bmox.pBi^K!<vqI-4[q!-N!A<J^H)qJ6Ah3vcpC$$  sWt7d2VDMZpw"l (vKa<#&ZXvdpRfp6zH-u[d_mkxo+x#8 Q?&  62#! A<i$6#q%aie!^V:yS+_fqL&SA!jN2:0yS+Nd,z9 *w%620H !+wo:KcS[OGejBj!S )-TL&H(w*9z)QEUBgsVN&Y;!I  K-xnXhr(Kc%`(#eb !!GeT.F 1PL"6V:"xHD-N%ZV, "5" *Ng  Ox QPm,8#(N$#F b,ek2[)Y;#w A-U -1A"l %vv6*!JN!eP)I E $Sh #8n1s+z7S@W 3V. !!% w reTF$ 3<]  >^i{  G&$C0m(qwkhjk. #,aVKSF,:OiN@Y; )XGo9KB<bm64xP]x,+_d*Kc1Jt661K/tX+Fa2J^%G{9d"*i"IX`ZSJ^%?rp5mbKn9ovR&J]k&m4dRV.wGXGT{KAunqH4xxtu<p!d Go$gqB4G?jwGAec{Kb<jkic-E?s0Am^=IWv!qCcnP]s3X`o3K!%3m16A?dpEAmD"IW%7f/by:2v!XGr L%<vdhdAy!yRXGa1IWGv#ON#h$q)XOlJKB1_nWdcECv!BQa1J^1Nrn6rK"vdB9LFL%H qF6AE?x.*zfmNVBwF96bK tXB ^DIX%?c@dQE=i?o$O6J[ujde7d_s$P*ba3G,v+&ON*T0 A 9!L/&&"*o8E_t&BeP4a#S U0X"+hK!F,8HDN!7Q0V  Sv14!.bm$xq@2V A"l(e,8/&QUBg)NP=N<(jO;*,  ,m@^$$ "2Y,A   BNT(IN*Ul AP,!F>s%tK38&%Z$xfUhV$VNR14cg"|3;,J:> Be{)b )&Y  !*%`  NN3FPLbg$5,<ePNI,:#dN!7f+UNcOHVk  2WY9"u_s,Sk. BfO5xN*N8 A  !R$U,@1w$^0H CLP!H.c&+phfsk.".8DH[NPY;1m  22(&!*HP Q>F b]y)UR6,Q=-N.Y;#g ),P Ds_$8A 2!VJf$=."17O4l$VNN3?Rgn-QQBw,9 #1r?x8>pi#e7S%p   S#(N*"f A>J"l$FW;!I!wkD*4 rF|QQ2.OG7g7R ?7S+B 2pd ""[k@*3YQK3OXBm&x :%L  9QIlRw1tBg8^=.&WeX%g(fvYOH r`IB,9ROH#q,@3LR>?M  h`ei2%.{ !"M,j%p7O&/$8%kBgfv  (jgcf#)lqqBs$%NS",eP :OoBm3/N;>@  $9,o 2O;  $>24 D<0!Y+3$:$VYM8wU3=x=x4iE>$Y]L(*C^T*5S4(.{zxY-OxS,SucE4hsp BY;rGU6le]a8</8$ZZsaPI9%|cH:gPuzwZsIrK@Sn/T3chP F-@>DNsRy;389rc9<Xya!D>pai"3"/4#7-b8oQbU&F<9"Df5)Z2fdEdRa#H8>s[5)^A!PU5T1w0;iQ.2D-P3IIz%4#O7v#A=LY^8sWD=`/Y;n#-6CY<DVOTk85I9 hCyW- r?LhjkCO>;QAkQ-0wVMO=&=k6QPz+4-@IlNnl=`d=4/CnA-18wX3lM8?9A]A7r.H!LS+&b:q<ME$sr-0aJUs=p@X8<Qs,].%U1L+>42f4I/4!lYN!TTR&A5H8<"e)q*1qaZ0iw;6<Ws[(E-Q-pU:T2/`<1PE(F+Wx&LmS,`]:%"Wy[,LDDU4S^2d:$s`+*-BIxZ.&  b8=Ec5&/KOM{NT:&Q9bhD6A]]U)VWS55>7X:K(DZ!J@Qd&Y#Z7W:Jh^Y-DVVYT!#W8=:?.$+W&|Iz&0qQ8:hy2>/*IWN3%m83;kt(0y-AD!Q"j38:5p/T7v.U!.TP%dcB:#hD/G-1-bP>>m,w5-]@vm-Q!R{N=/ m9B#= AZ1bed+ |#[<1Q5q)*ca>N4Ba n2?:t&.Y=39RI&),l<qh@@3V^r/KDSf;2;m#E/J.F3OZo%e=w8>hChX*rwgI9&Xw1:f/8#.,<DHNsk(=u8=Dej!,]((N4k82^:$sW A-rOGN,ky=s6rPXx+,+8sSll$2e4(9{24WS!>?I=W/s2]:x A,Kl|OgkX2Z>zh?uAWd-M?HT2 k2]E=sv-r!gMRka*/7xsS)k,LCf_D$`=m7VPuq-.F>RSl=7#Y76:+3e*AfjQck85D:%Q*,V.%-WHS>"Yv4i"i27[W9+RH&I j9?0))h/Kg>QcSn&J9bsJzzZAweSm>+]j7XF"/H+hDA",eT=i R6N"5*_"tLX-EsVUFpj0gN+8.  OpF5NfC?!o!o*R%ZAY-acG {ImP, O&ZW{fiIy_Of1by"hwFN!)nP^Yt&)PeT! AU=L[CL2#r8?xvE 3.*EUcCCM:EN! k&af{1g%pDD g55vEKUAz!M#q&MaC<8%[]*eX 9od,>6-N*B(-J Y$?S;@P8u9Fk.!, 0je!$yq!F:H6@!oj )&.!,4U$ 5Ia  7S"p 1NB !XGa2NB7O (5,.gyS+wlN*1eT,F 1ei  +KfM E<a /8<:Fj(+%r9Li%Kw&6r1v  !YO7HR$g`M4&h9!MN*kR COO!K&`%wph #s_  ,:ph^=Y; CN-E^ AWx  57k:  Xh)I b,@,8 IE3  N*%c Dg!!LFZ,Y ;,;8uN/$V[YG?,9(eIY"mie.r4aSGY?9$N@vj  7W!J    "-O&#H$v-n1rZ%Bi3AN! #88N! !W6 "]kN-Pu I,P!s"l(Qa<t9HE4z7_ec  1r+T!6"lK7rQ4a !4LLX"_D4X*Ry--AH/<9GXHJ4e18, (6t;<Q1.GP5*1eQNfIWR?83c,rvmS)SczM*Q2]`TDJqncmS>>4k1%c$_ygkFR+%BlE!0qQC6@Bqer   )BQtyMWnyA+es    c6   bR%"v6k NgRby(y gN2 !Ew ) !#P2!!F <=..B7O"z QBk d)9#,M= )EVO&,8$5 1,?=neP!FOEC98.Og&-  DqjARV,6wk  n3/h !r2s71t-_:O=-  0,bb fN! c Q OX&TR5L;mQB7x/<3^Z2>4=|<Qhq2=.L8!  &t)a 28L fOx$=d+ "0M   6+5,<>RS<fE  9+NN "-Q!TN3CY?|_3BiLv -?3 E(#0US[`UHFQQ=9$wNk7X"+YQ)L!%=9&ANk=2!w E x$$#:R626bb#Q A,AP=2<u8XG(,#P&K0L 7,p b  $X :,<!EN2%X b!":>eP(H vN$=/3|Bo)ITBY;]3N!2L!1eT/(  jVG#x[P>Aas]-L>ImHH^2ct-{&@DoYFKfEq^)jmK"XOLVUjRSp-)ge=|OYQy8qEX5K7/%+o!#LYXQi[.C5F2;g6lLP3.:L(L;,Qa%{q)6=!Q8Jv<e$Z%)j`M,socPIkHjZO 5Ev{`hy8div`i/8$1y<(,.8CED&!>29o #.*{[!vU1ZX$@@bP_L,D@fNUtpYyoy%y4t/CF68PXH?yu/W?g/mpQOcP<Z9g)6;F^1Kd&ZBj`8R!GZUYyF?n6a3Mru_^t1y&-kcDJ#c*a ABg(#!%$5 *N"nh<R]M(BX(!@KA,tr!BxI(4aKS S!:7Uy4n^)9$XN)Pr0LgM,8 A ^ F  ,9*o%: y "  Pm%* B!eey=/ %eP$5)) ) 8,N,;#|  "l!F!X #N)/+NIBhSdN%vE"+  !!  7O"l!w!k *7Ph? b$A   %N! b ) " - !Ij 1 & :N#h?$v"3 6N!%Z2V%2 / +7O%Z"+ 1 2eP)I b,#(#N!7O*o&p!$  ,8=-.c    N#_s!V;h  1Y0R%a )!) ! !=-40 l ,N!/&Bg#y  N!=-a]PD + b$))J  %Zd+ M&F  7S Pem%[#1eP2?  Y9"l19,R ")1 % ,Bg$5) ,k AAz  /W>_ (_B   8eP  &?#H "N/YB A7S.f  #w"1N*-G  )U(n!G;h !N!N!=-#i!%Qe,8 (g(%Z $[]h?PNBj+&N+ew (&I/v:&:O2>-1U3U8& /t:i/a/JZsr;Q#(%CPND,8RZ[H(DQ!l^;(<Q;(2:Z!I|Z1T*=z=V/8(L[H!NU7>]-#==-M c%k $V]=Y"z !;((K.%UGV[(%QbND,8,`.%>aV_& 5SO4  ,^.gIrTS&Q/vN@-;%aN!!h eN!=r;m:x(J- U=QfC.1r"4/X9<Z"!Y#d $*_ 2O7 cOW#R/&-E:>-e.JU<(G b;/Su`6.%P(a^S_>JNpRWEu.J9-g7%]!0IuQ9wj2^-w(:&bf B3j2hw-!P4YOUI!>MD;]&2)0r5^j&a`r@&:/nQ.h9Iu8V=80D7if=b5IgRpuZR!0GnS,=T1wZkZxUWl5@ehPhq4E.JhSU&Z:>^$g/Z4$gBhZV,-+AMi$Vq/m"3Zv+Ua(4mjJq60rh7slSo`n4+Q--) 1G` hRw"p&?/7Y9R7,9N^ -BgS[0T!/ (,:4a r 9 u (7O11 E ? +7O](%! Q #ePfv==&= .7Py4Ab j &N",8U$)I!a *pi;d*N!0 + "S[4@ f 8N"eQph04 C "Y:my+C!e +p|EX2)7R;d+""r #eQY9&`%2 5N"vG9Y!o G &,8Z_/W!k &  vE)) r # &=-@],L%p  QM = "y8 b"oVJ;C"? -N:ph4a%B ? 5N!F{*."/ .7TY95E"S -7OS[ziN"=-2V!B 2N#BhCK#H ` +N"VJ r"E 2  ?x+t*o 0 "Bg#P&? t !Bg0L)z"r =N#"l/G v rN2vE6* I % ),9%Z(#!L 3N"Y94a"[ 2 $BgEU0m c (,8Bg&` | %7Sbb(#,] > ,k.;d"d ` % !6*&xc8 CK;!d5$%w;dD!S]4eeSP6 >,9myI9#Z = &%Z=n"7"L  Bia<%R!1 ;N#%Z4a!g 5 #_s(D:J ]N(7P1r(m"+ +,9d+G?$Y = #](W/%6 J &vElS++!( /,8h?q]"G + &=-P,$v WN)S[a<3K V O #=--^"N!`f-tC +Y>S[3;!4 >eRePJ.$r ON#ePIj$^ T 0Bi fNJ,c 2Y9!= -7Pbb4@#D BN$bb3|5Q YN*,8_s3[!v +phF{g{ $!"7R](II&7 ]N(N!lS%s!* -pk4a5$"Y B &HD4a(6$!N8!L !N,7OE5"K ] &vEY9%c!Y ;N#VJ5E!V 1 %bc:>#q 4N$N!sV+" t 1N"d+4q"Y ;eRBgC+$z!/ (7O]i*N!- /eQY9Ef!# yeTEUrr#, WN(vEZ_*o `R),:.sN+lE Bg2"2/G&p;d 1 (!Ef-=1  eQ](.2$f 2BwEU6tBg4a0,   ,7O7O-= 1  N!Bg]i A $ #Bgy4 A"- "ePEU)) A    7O,y!V , " !)I$$ $ 5  D2o!q,zY r ; !N#3=26q(1r&` K / E#) "   J "BgF: 9!/ %  fv 9,B%a#q T    K3,H d 17OHD!g#D "  ,8`xBo6,$V 9!F&?!@ ",O)P!&7Rd-efHD $YKEU$vN"AA!V G 3N!_s84 /$%O8P(   "sV#0#] $ &Y9$v&O!( #Y9!F,a,N$v(q&Z %R% . !HDD0$U!R !,:my r f HN!7O`W ) ^ !Bg@]!_ " 3N#EUO& <!xeP kNdBk"qN&"p#R 3ph"[=9 )!% ? -    #q = "N%HD!%;K!G-=%dZ_  K7I)7p%Z.B"5#1N!8,  N"r3BFqe3;/x " #N!,8"l"x %N!BhVK 1 &NNBi#lN!!r!9i8#U#@8@-c$$!i &eQh?!F$C-JN!$:!L7W %XZBg $8$1sX_eTkA $PY# V=qkL%<* f5*[L#(Z qkI7k/Z!2[[hha+wl5Q %3KrNEY9 B7qN!;4$W&=5*r=u0X%lM@*#bhf2[Zcx$*rD!>[RG#=6Q!{`,*QTM!JeP5>2Zg{n2+%n 1r 2CC0<!% b!g"rF:&@#M0r9z`3VmC[J[$>t%4F-r`,XF2uJWQRYu3@sC#/&28uPw%"F7.H:FyFY;2uLgjS I8{PPOfTS-Y;tR?*&1Xh+YS,@*J "Sm)r7WO`rOUx&X!! $-L  !q&5N*#( DP4!H#0(4>R9YS[aLSEf-5lrbQ9- 8uAJjZF24FO`ei+VNwTM;TqU0sOX!WX7k{LgT1]d4$"poa*PCh;oR`#^8Zs?#1,;xY[Ql4kr9C:_x9*d2uI<Qli82^h|uF*BD<Jnj"QR1:PmgR+hZNN8lTTR8<F+(IXW[CE%>mf;5L[]C#Y.[5I7S4*2;H0#Vv+(Od?K(fq:3 :Jvn/zr"L,>+c69a]#yLWe>:N-hii59a"y7g*afQYI<Zc)5/.`>pUY zDz<cI=.j9jx-.wx)^[UVt`6SQ={&Y=wp"F7S!R 2fY c!V#X/h-=:>$F,?K3_!&z I7Z !Zo:J&*<8!, 6eVph.!)9 0N"ph_2)r f 67R  /W"  0eRvEC+!o {N!eP11#H F " !8u1b!( ,N#my/h"/ JN$HDT@"[!$ &phr1+" ^ 37QBg2%7t,:<8!R 0pk:DMGBgt|1  S pePEU@<(H!B $vEG`"| 7 FePie+d!{ $ (phBg = GN&1rm8!6#] +BiF{84!e 7eQ/&,X b #N(  Yz7/ U &eQ>RB%!] a "K38T"O B $1r%Z>: T 6 #zY/7!q 5eV:>Dq#T :N$7O/&(P&w$Zgg NN&HDKt I!i !,:Z_40#X HN!bb](+7 aN,S[$v#0!m -Y;S["l!_ 6YNVR"2,9OG<8!n!h8> ` *phS[";$- "7PHD+t#L D $S]3;$M @ JBgfv-n"j 3eRh?@<"+ ) !7PDq"| o )N!7O))!6 weQOG<(k5>R#SphDq&x _ *,9(#*_ 3 1eP !8D:! ,*."+ 47Oh@@<"d s %1s]i&G ] (k.U$96_t!L7[yh 1qX!+UU#H.B"PEV!g=Q!s ._v"lH< b /Bj6*1 #V `eQh?t+:J!Q3|"| 67U=-l3$v dN(k/-^+K n =%d-dT#_sI)$=!1 17PZ_.c"W 6N$:>L8#< W $N"3|&W z +%ZLX7ak>0! !  )I** X &k.4aAA!% /ePoBelS`N?7UPm(#19 KN)BgEU>B!9 , #;d&` O!4 !)IG`$v c #,:k.+l": 6 !h?7/!8 .7PBg-=%F VN"HFV* I!GHf.Sfv$$)- <N#ePIj$n 9 7phrr3d 8 Q,:;d4a n!)eT"l>2#< = (  ua*N!9 1Y:qM;S o]i#("< 9BizYEE j V7O/(Yz*2 2N% !XT,("* %N"Y9EE"g!Q7Oa3 :piY91r#L =7RS[7O"|!:N#1rX4#X$6L8 ZS[@<!m .7ZPmEv$E s7Q1s!2f?=s $ePphHD!R <N#](0L#H RN:=-_s,H!. . !fv/W"^ 7 #,8@]#e 2N)Y9IjAb"0 /Y:ph6Z"G ,N-](He*B _N0S[n=L0*oJ.&%F{7qS_6weT4t :D] p#@ $[E8(&#"l 3"rOG!d mg%%Q(43h@^DA $3|!R$e"|@i,8(<CS/i Y x  HJG!eb_t!Vf51r  BgBg-$<V+SOG :No- "oN#?zKvC."l iY9Gc,H  $U[l4dBF)Y(h<Y?{n_q yE b  .CD  -%Z%B ! !=?*o #"pI) 11r 1/39ZC[S`"l#m#z)9,] bUU],QQ A1r!%!a&FN! .#6eP%b  HJg!emvX!<eT&V   t#dN! R!=7S&V"l!]&?N*,2%Z(a-F  7` K7a%[ b7S&>  #k"|N!YS  7QBg"K A ,7s=?!H8u(%UE  +T>c $ b&S#5 1P8!G0] (!<fI&( A#R%8N**a-=^U  /xGd bx`"rNcC#](O:CU#tN!DT  7PHD r8H ! b o!uf=%] !1wf{7b1s#;eP!&NfC8^SN#w:Pz%4 i:g[hw{Uz-A;sR@-#5n!RrHZ1r5N3kOYu/..7.#So-bLj:q5E8|Ek#/&2T_OW%|8;3BDXn0)mU OYQC/v5k#A%u-Q!BQbQ*ho:""|u@-r>LN-:Gi!88gcg:-Q8l!*Nc#U6{0@ #*0OY8?=Vu >R"`Vk- I`OX:Ww"1V"<+0Z!-3TJTs/^;):ZyG%mlMI4$x,m6s:RrBV>9&Edi% Z6S/;O^Y^=zD>kP5EO17PO[*28kS+&(i-0q//hcV^a<PxjR*36s:[ >Z 8D>`RG2<01g%q$T!qc??Q{&*2<!oZy&r>R=7hht/3@91iz&rl =wR?:i3 [7aT),&O=7<Y7|0O.!ljUh`^_@?:yW5/:c_,+frM_;(FnF>W[tg*&r&UD>#)Ht.F9M]=T!I[@g:&K`3?rY^d&c8NDzhi=P169=ehT2NeFFR/Ho6O!c`*(6fAAJ$6&+:BQ%ARZ22mRB=hq_=v/?g:+g&[CW#A2:16OhVb)+w,;r#Y `3a[OYR)L n?A,15?2[D8k?)[TZ9!;u5901C|YPWAC`:I#Y`5- [KaR]m8HeR?bc`&m:Javf9`MP4h&]129OKU,^2P!7a;X8H6stP&G26qP=9:NKA)MD4==#r8HXhkF]k2BO8NQ1vOlLd"eYk0M-J@FT4U&PyltSs=wC]&.W3ek8Spb7z6mQ1U7QcO)88Pv!"B.Qf2=ZorP2g=$vaBT:_:US;kJ8=8mw>)S:l6I1waDfQ.ZFR?=m*Es_d8]O4?LC>Pw E.,XDlfKA>Kkr@GIG&*PLfEOLN{v]-A-URh1C"&7b(g]R@@x8{DPOrA;.g|F!.$0)AmWRTN{RQ<5QEAFD`CZ/man8WdfJ>Da G9/{3A9a=_w*4g_7f.*#3oQlW:>>F._BLzWtD6=yhz Y5KEQ_(bi"E9pA-^2Q?=RGP[xZwe TPt&Ht"8f%^c(yTW@6ywF*Qs^hYAxE]=;=nU6.ER)f*rO-ssUqCOD_"(^&2L:<FE+?L3.*P@lcY=!@FTSVT[HQ2dhteXdA9v*yp*fB1Et&1My P@Ei >+@RZm*17"Ks1A4UeVxOD%w0`wT?C%[f*5tS+jB1%xpn8A3{GSO-Z[0Wt8qNs%;fbG,R"NT5(PkmWpRGcGlJs1uN!_s"+&O 0 +7O8u2o-G#YS[ T (Bg8u!%!: /  =-,8 A -N#vE>R"[ H (Y9r1>2 ) <px:C&cY9  .R z -7O?x A#, # "e[">7x=1 !Bh8u   = *,KV[%[7Obb(e!w "  Pma] - /7`Ht!jg{=S (7QIj"+ + 5pxVJ#WN!Ij+d E %eQr3g:N!.D9I7S%Z1=%b  O? ? &?|$wN!ACX6q-,8)z p  ePOI8T oh?(# S ?N"EU#0 1 #N"N!_4Y=K8O!Bw:e  phb !w # 0Bh7O%: ^ #B{KI$vphZ_&p E #ePy4,X$?-(N!#p$o7O [Wvph A8UHD 1`P:>XVph7r-r>VLkS^CW9 s`. -1Z` bgJi+;l:cyY,<U)VYTR f;m/D.(,[r5Qb&ID1H%ev<)-r>]U6=/CPN@" !P !aTU4Sn k9AQB#5+x!NS.%3tK:etH+4[xT{NBB.`&>9E1yU[&InX&S^,t;n# #Pm9C-Li&b/t9B/0/F.F!XQ#&9;$O0Bi#I )ke AN{!i(#&70L!iftL%j!NW-!g>YyW a>AK$W)y0Or-J(TDl+E_RO R-crUZvTbT4ASh(W#3 g6YOUh8X=8:&=b3?.crE(F3 >ZQ*- 5*rAaPV<8FC[hWy_-A!oX(TRfx65inez3BOpLn(&I3@$Rp@;6R-fU9UHOGL!;^F.3 r=U=+fD:;/in521U"Y$ZN*.g D9r!H#q(,=-9z_s*q7QHDWO&d KN#ph.B95&F$]95!*N!vECK Q * !Bk-^ r!N "N!4a3[(L $ #%Z$v  #P 9ph,8(e!Z ZN",83[ 9 9N"eP?WZw]<5$"x ) 6k/&?&? C )N!_s!F$>"#f-,? %Y:/h+d"n;"+7h?!g!{ ;N1S[%Z b ( *ePbb.2!c &N"%Z-= 5 CN$BgCK&p p  pjS[!F p I "N!M^"l dN$7O?7+C!K 5eQd+!w## JN&=-9Y4L CN7N!YzA $p &Bg:>0m#V -eSk.3; b oN$_t&?(i(k4@7W!L7n=.!jeP>%  Y9](%{$p !Bv:hO%ph 7g3HE%S7St2 1qi!)U5#P11#rN!HD)M!# &k.`W$-#7 #ePPm0,%L +eS"l+t#@ :N4N!5E)r K $ !@^FKHmm8#( : NBjeP)I!Z 8eP)J7O#2"oP,8m 3N"R8)k[fK3,X*T U7R)I@<%! MN#1sr1"d ; $ !(#2g Q o7OvEie!k B $7O1r:V B $,9Wp3["8!q9D&= ( !-^3+"G 3N$?xJN!g!7 "1rIj3+!L 4pj0LF*") 3eUPmeq)j pN$N"P,6:"9 /po?x3+)9 =e]7Pt[%: 3N-_tY9(<"" 07Oh?DP"A PN%  I)$E 5 4VO$w7pk.-=%q$1PLD_ ZeQ?x4q>>%[&O!3&eeT74 4[` eR%$C=n.{bbN>7z9!Y9 :(v;W] 0L7h *7a=.!/8P"w 1-) byE:D@],aEUNCpj$DN+?) Cjb!a7v $1u8zS]%87S)R 34L jnM#&6k-]4aRhBi3BN*e2 H(-K8)I j `Pu!< AfMa>z:N!6l$E $,8 f/* 1?#!F!o(J ANZ "$5 [$RN*8!  !:>p   "*uN*2L AD(*qJ/Y94"RF"qt<eP6,*N  <HjzQDnnYFQ(P"Bi6"N"TwLiT*&=5n# +5,<!8L(&) _6s:S. ,]VJ2V,Hk. GPo!T  !/"s  2S6qhH#2Y  W B<P!I5E 6#2Y^>eQr0fABRwvYHD7Pk/ iN!#H9).s !Y=>]L8"S!IA  .. ,[/)K3 !fv6*%tmy #VRua :`Y9>v_ph9NS[&Jk?Ko2^hGVl,a04 "T 887W!{x-W29#!^7O-!6Qgt.Cd["s[C,GEb H[z&.N!!C!_  #R:p6w !,]>^&mePCMGk<AF&0r[`oXUx!F!g%_*o7P%[!K7O$"7`7h !,=Z`"s  ;=Gmh@F&,>8uochG!I4a J a^tr1aWUy-KMn:V bTa"t2V,@1rNGN! S7P7P jN%&R 1/C b"K"nie,H1rNPBi%hN!!|"q $-E 1.o bSK "hZYR/& pvB{>#a"r!F,@,8P?   A7TeQ e $&Z 14q d.2"lR6,CPm )%qvE7`k/#=7S)h 1<< cA1"p!F <yu@^25@9  VXyBC+  #r,uBm!%By+V j].Nb9z,>"[Sn)L!%K?NBN#%oN!7[+V!%U%+3%_yQ7s%[!P7O 9NeY9!JNZ!> A@,!F5$%pAA  VLLX 12($ED8 e55"n8u,C](O)N#!b )"; B-M!N!% 1:J!Vep F $(% ! 91vQ1St)K8(-s  !(*O+3,c"1,SHDNYph #7qBg".fU)RNrN! !g@D# #,{sV#1q0CK%P%ZB%$I&e-$?O $N!%Z](%D f8]9UrQ(&9|jdBbt98!imGQN$S[>R)  " V,98uJ>$Q DeWEUeq(m!7N*Y;CKJV!9 KeTB&JaEWk2 A%]k2 "#4RV,P  ,9ElPMBgdO^ UOU:T*QV=UtHXEd/sTQe+6!2EcO`VP".a2;n8TCH6?m2=xCG5cCq.(15';
const RPH = bytes('q+TEYxhRG#w,avlvbwg;q>1?{!D46D35Ogqvvq/(l,lQ;IX%jeq$fE<+0_D/:-9zPHMV[zB,-c>k{YNR-^9t#-Nk+H@]s*^3Lo)[53+XS7e-_%Uya#hRiX  ');
const VOCAL = '6rCZIkFo#u#k2_/:"t[42Q-q7_)upj.1Wvekzr A_a50 HZv4%2+   IUJ#Py96;"%wFn*%e9t!Pj*`%g@pp3*UpSuaFR>9nWvepjp*A+nPz Gkv3<o4H`(b]aG_x"c<{kjd9gP6?Rc4fleUmdhl#[!J_v$W&G*rEf 4u<*NJ"TMN>?w3[awH` [wd-^do/a yD,Wq+L2m!#8??zV u@!cntN$Iann(_pee`D*qLV]"qN,:UY[T%fEUG-pP-7t<N!G5xd,>%/M!Fm@"v-6._$:rDHF#%<a$W]nBuQ>(D2:Gj *QHy49UB)Oj8BW/H`Ne";G$k883*]"Jjs4g8sme!R&32,`39 ,oh4e]C<TP0Cl!8MzK6l!{dLPP_TN"W[g`"S!Uk0%?/h(ld?S`dp3x)Jyf7S1rea*8 NYN"|h?7SC<8!h4^N]1OhO&1X,8Ns2K#QBB #":_s"7dgEc$M[[$[;%C.*-j4R8,y (N5Kd,ygVem{!2V7%)B pRAr1cL/` _)aeQ@yU-"#_Pk3n1dt"F+YpsG.o2,ox<YivBWqc7{Y!!953|K5$lO4yLB(vF=c!IG?sWK=[^"K%[k2l%:*+t[)pqYi$$40c_espB!%3=.U 6">*NVIcL$I$TsW1owe#P?G?xkrwV%JR`_yRUE)8a*rBmBWtl*taT,Ya|Rx!GYtf%FF9zpdq$ ZO+oCDr{,![x=Zhq-PD&.tVE^q#Q )8R]eW3`!N&Y&iO #vbSl*={8!xW4@BXqm!QheDs_tgD%|,d=-qi_B hy{"n7;V.$-+=YHC<tKAv?^,JkAyD,bx* Fp)w*p@4y LdAF|7-H{!yVgmz<*!0#DR&]+Umgs(hE8Bn1#W`%z`TeXJ]<?t(DJ!+@<]HgIo]NMw/B%EF9v!6!Pd,Z5`9!?VK %a/0y&?@fN&zF@],<)-Bk>-a<&.Gu *jo,y/s[8 rcuk.OMcq bJ,/*cnU/#2J^Q%:z.g--)h%d6FGPXSHv7SD)o3fmu0f!z:b CmS. FO9I)7bXX!F9Yr32eSn)gX_EaE!//#gaTppgi<a+1F97VC=X49xw=7a-XS|Cnut!7P2-a9`P)$dh#r:?kwV*Q34_vi<Ro0Vr&q-^0S|;8#HYM0-bA:Rr!N.F!8usN*yO!u>oD":bv"RDMa@@KwT%E?7],(HChI|CEq!0I<0Vc"Q^/Q`*Obn&Gf*aX3|9uXBN5Vq7O9M74 Sf3if;Ej-!48T?{2Vb-$NDnplDI8]+;7/7zZ,*N2gty 4j!k..H;x 2KY7OB4j; i45Y:$!=r n7x?|I,-I$bH*%n@{9)4Mg>O]aQ_!idr/N6=_@=K/Z^NZ3.9Z7N_o!r+yD1NH@N pO 7R5h#<!Q`nS^qN@]#&!t +r8a<&PFo *UZr1=aMn!"Q]d+gvU`&c?`U)-4zY-"$q`&6) b$bBz,Hf$0<S5*)N8LaG`WgP(NPCC3|U9u; C!DF|%Ske"3MEk/<K!2"Bvo_vW;qa#PsXY>VAc6(8 =pp2 ff6[Qc 9Gs(F2"ZA"S4:3=YT#R"L_>>V".6#$|$pn*!#"x($LV_{B22N0N{hN(/ghO=Gx{7evwH$ ImzOITaG`ep+s d&]=-iVyi!TJ<S]2P{_"x>C,CMZ!o-cwq,S1vKCK8BFN6fe5$V6M>NEFDI)rrLX Vq<phg#jl!0*nPoajs:CprZ %]D?76I(nYF"K4@RBIwO!"*(E 6Qq!-b8LZd<f+ `;Ea=Vk $ nNR%j;h3x1x&6ebVX$f)KK+Ybhkb1,Pv07s,I$UD|m.PVSYF>neYo!t+ea=>Vz^!R8.bc(e(q#;=p_u^N(]*DD:q ?z(TYf#feiaArQ.g0xN5%rjI@?=& gu.)J#hHF!i>xEWX"GS!n].k6bfWW9i+(Ye=t#q/G0lf;PV&?/x>v!eFbd+PbUt$B^{sX43n&.nIthZ0sI$5[srSg68HL.A3GC aycV@/O^PB;b285,,9!T/"f6n3:T U@Y4cT,`C#pj<Y@e?(H%KL.eRKOtC:Sy) $v_[S- jt7iFr267xj9O:y!I,4g/^"m7+fzz>>k=OB&Pqq$"G"1<|Bt=Tj90TWvfx(zW?32s*!U{C5f0Nuv Q40JN?sMT!F k;gL;>F!m%YSb]/rj*2<KBl&%$f$=7M7SN+/WKug{ /eUO&KM(]NVGQ>RO$c#!ceg$6*+Q$#F K,:d&N{&"+%Bx&%j9+IWveV#7b yE4|Nw953|Ji{{ BHODq9W^O$e5lhBipym#<8sY>Q#P#&S?uN$=T6:$^=+ +X;lSj3HPNA6B3|4{C%!e-MG K8=Y"))$bcv>IG"(5VHKvGP<&m$&ejOr$^%U/&,?4`*.=*zg7vgB3[56S[Nr=v@]{+8)"&g6a=H?IE!+*B,9Sg>J)DWZ "_Y;"(/U[ )mAM-6/tL7uG 3;8^LsN|Y_@]BgTn!*&/igNtf`$(6l]-IGO|(q/V%bWa;S.L!mex2{*N;BXbNG_r0mDMA^N<QpHDqpKm z7ps[,kNL%TM>],/M[[-"PFpw1uBV0v<vNvy6mXNSSF >vWfwU[i:Oc"P@^PBBg"Hn="ngb.]$l!g 5p@ r0PrGeX7UA)-%`j,Ia]4P,zY# [ 1^ng!M4!Izr/({]%]"*{_eWXN3&&^sbHyQ^,<%`:o%_U@;K$uCCYFuwV*d 8fg!>i Ay]O*Ol]c/iNwNW(v=rlYgE)l$xVME[LMI C0>>BmJwlC$BT-Y=474@4VqQ )GF(e,o@RO0Q3n^O6+i hgsr4R@!a%In?EZo.<<)VD1Bleu]q6k*;N2Gl40dlrr!{n33|HX@r Z8 >Vq52K!YKNif;/FP#wgO=8{t6k.O&c%s4./xf{s+9lNv>cFy7]7fYc28&lVcN=yv=._kX>"JwofyBcs4#R^.Pzq+.B7T*b,Kgg<8*n[jYO{G*N/$D=NynO3|Pyo^ oaTEV@R58!)F.eV9Cs0$|vg`!QWB."y+g,O$DW`+R2]7gGiWO,LMIN@?!5$LF;]"6wJG SW&1"!tIZ`B[qw%J{YBuf]J:D"JJBjPVo*)/*Ppq{SVZ;jmu7f>MG?KM^fNQx$  `LA-!!)voDq{a(!mg64bgvIQ#SH-YD7u0e2UCaYC{WmXR<VAN<nz$UIV$c! y>-^sX0Z"FMkN*uV.D(kw/=3nzE=#@#d 3/-$58N1WYQEz)I3de+7a"3H#]zM3NP!LBh9k#A! :geWp{ZJ$f,U=2IfZ%& msSh7S]i&?BSYD!+bQUbdq7b!$ocEW{_ B_"3<B#pM U(geQ2"xd$[fMe^gOMA?#XmeUb5U5Y>4k,MH8/7^WDM7bpRLyzGQ4 ^>xWr&*89$-]t]/Z8OS&qKJsZg:Ab4Bt*eWbI^=CP"tNr):#c9"2Ley0DM_LGiGNV==Pm=Xf:"3dL(,u_-h$-%qh]9V%N)VZc==R0&&:Ysr,B*&GOL$._ j/lHhW_QOO#a@yvJn>O&ZI2z]ScPk)?kAPn9:"|+vvsT-Qfb189srYDN[GOoy_$Nan`LyA-Qe d"]XTKgTt!%`{Bpu_/ +#F=HF9V##-?t*e`bUXu89yOqtGH>5D;=HN@npM?yH#N!*@m0M2CTD"FI4BlZ4OQ# F<1t9H v(FOK7VR.Y )#`s <GHG?6l0S `p9mybyR!P0@moCC?fr ]FSy7u^.{" yJhAfhnM*|u*7fQl&&?<!# 6H9u0aGk?8V194 )_;: 5==mz=Z8b#8dNfw-0O3(v87Bi9V$j$Wj?vK{H{o=sE[YB(y4@D:HQND1jH%4wQ* vB6n`&-8*%!YYk3Cb-G&PKwEY9@"S$(!ON.j7"l$|]>,G)M-^/V7 NFdZ:_KKq1 ZHcS[DECS r,v,8h/g*!30F:A`yu@)(QR,?v=S+aXC),ZxeX#;:7K8H!b5$G RS!-c]IkF$V; iG|!GTOJg&Mp#E[&+rf#-a-=C:WgB(%H1YATdQr4MTlN2g=$vOX;j iDX)LgbN1!*QT1sRE"b.K(&pu!#k*2(K81v:QO/+xv(YA$0>B@edo7Wf<9YY$L;Ot4=F|2IJS!c=&aBvq?+%RVz]*d(6N"H0kBl$[*F$|rU,?*(iu0Yi,8!30,Xv_dxO6Up85`c/q!;YKh?k;9+$aL "mgm^z%MFOBtp@?`(0%T ?s5S[*bME fal,8`rzj JFz1rzh_X"%%pBh;@U?(zB]/C(_K7#Qc#YC"*_kCEMOeXD)os:RqdO/fH?xCl)SN;A|t;`izP!kS6IjXAC-"N>`pj)S_R!mdFYGhULy5xwq,QD*.R,Q#g!6FJwxE_sVP{Do !S(c%!8o@h?zjA&!Kf/@ 5)JV*zt/Y<w3>!+M%"Bo3H/W1!d, 6o#5f:=EiNdZ3rrx5=B#&D(;e!.QC!4N?VL[SI^+yp-p{rxdS,3aC7b#j+3,,QON;ll>5)po`!ulYXTiLyD K,|K7ITZ{"&rkh@=@+G,+Ie,Ky *.JYbo %8a%{0S`PNNgIvg([E7P4XF;"Fik& uo8r2;qY+!%^GN$_hy()kDH7_K&HLC8D%eibJcVW4d!9Q:QBg2lx?OX?n`X-HsW!/@AEW.Yrt"4A[hG$CC`&@e#k4!Pl;.&M/,A#L[S=BUrOHw^ ARM-y kA[F|YLt0 c:,]*f x|"lRc`! bd[!L@vN+CN"l%raf =tUZ_;VbjN/mU,y1Q.y BS2wlNx0Y!wI`ih.(Vu"PfsN$#mEz(WAUN(JU0e0,,{CIIg_sYraT8qs ]j2DK=O::s/hu%A0!ev=lUS!Z@!lH7"nrufE#d)6vN#mbA4ei?pv74R%I(wp )-&F{A]ykNtSIF<Y1El#6g%d.+EMv,Edd4r)WC&%xW!N%2+iDCA,=N>na*.-J<"NG`#0m9uu* LH?phRl!3!-Lea=+MIE!FkJ"n)hJZ#d0PY=2N0T#(bE $#za</WZ8N+b1F:?bzj 4^7](im A h,8N"fax`!T?y"m5E!F(<_u%_1vu8&5F_,<tMj)6E;ON?o6zzWx?- ;o!-`qW 3"#/`u ) I^"MC!_tuE+h0!q;HOb5Yb-|qS7h{D8U#MgQO6nE3]y :XOR{!n_CYUR&X5>BjDJu]&rK(EjqZe#"/u5S_j"mH$yp8YCC{0]KG2m7[wNi$?+E9N_WYa<tdw+ R19>T;?u(!wnIPrQ^;K"HqL,lOPFc:3g@eWD,?7*frU G>% B x+j"8?4Po!rXA!vGzmz9;*w eKl)L(DGS#]F|=9"Ho*-k oYCC4,yAZ#P UHCG?h:ip$$1`CU"++AF^%Zk1#q2]:,Z#VKd)NJ&B L2&0phG$KpK8!A/.!&,^&N.b@;"2rI6 sFeS[rgqT!Cu4Z`M4s@!nVn"u@kG"#@Bc%u60`//E*>qQ(nyD85m.NEEizZBf5G fAG0N08[a$JZ/N(?kxS#qa4HLp@my%jGJHK8 5M$cco,FL!"|z3/_!;z=JN?fhm"tA)LZ^_yk)#(93>n@wV*aIZ`$Njs.&KC.,A]w/x20g% E=;z9*/^f8@kDwk3QN>OT^Q$7/&[v!sc5vHL2Qd!tH|eW;z_{%BA9,?q4pp)/Z],h#u>sYQut7lE4W/Jezj LXS3;_?zr sWnh@7zy%"b2DpiuLeD({Qa H3At;-g_BeX.7L(V$9X7c{bUEtB%P g_95Ecr1F Q+Br2/kcg!J**%]"9Mj"#XL %E&.k$7q]YI#tlt=_ua7b*j^or*k,Nc4OqLNvOi"N%7D5*U=W!m7KPp$M^5*p30Sg25jQ1th,fx03WO3lw77d(@ bK dlN<;<NcGeD1 QjF-^O&@L"YO( &c&OG(pm<N$I,"l+L;w 7s43;/TKM >RsVJV"d=NJ6<,<w81I"O;pr3&% +)TAY/-fu{k-<c$Y;A>O`-avnBkKN1 %aE+fk"]_RN1ngOG7<UiC*Qm f9i($g-T%,Z@<S`Q?qu)MZgpl("  +]42Bw$_h?:Qfrf:);5fIrZ[N:Xf  I7^P!`,s$6g3t9"S[yN#Z0M-";/`BiJXS3.Z.#q+n&b2?@sV7dfT B%I-^ sO3P.".P25LM?oD*^ /+okS]*JTVg"F,-Snu5(eD%>WN(n;!6.xsWe[kcg{G/l"NFl|"m)k[J%.SKa>=uf`";lt 4ZxPD2MW2HU;!$^Qvx"C^S{WQ9b]5,$/"3[]<q& `c6F{R"-I!k%kr31QQb",AdBjXo%k#RNE_v7|d;$cIG 0Q|y4?<={N+<311,ojQN:u[phi1A/!Fx;lSRPay&`H= $cAt"&Jp[N#h$h?$[#"Bo>veq6Z/veXf]0mKj4w us$,yISgG!)$(fwmoxz"ugTVL$UHD(fu| (!m,P&.Pb /3<>s:j{J7gF({a34lR!/s(;db#^/#zd%wlaXXy"A*d"rN|x7(ud<,;0JE$(z.57_*Ha<3>`rN<gtko0/Dm!lS8rr=><5"LOba>":><$?6UE`1XBo)c*DplBS:>)|aa 1rdSlZQFL 2j>,8D{lh!#pr/i/tLD%1iH=.P>a.),K ],12MA&$g17YOz<X*1#0YF#ucg.>w`7r&i5$EaDLNH{q@^R/_e seLfzVI><"7Rc1x))Z_"GXb,@I*Dq){aj -s@a]/TKm )dar1:%Y, JNA*pIQHY Z0GHNOeM7$xB3EY1*5v%qg[7UMt9b"o+!7["wdKZ(v"7qn49Y.oc]NstB@_oy:T hcUIl[q+M!FwJN(MK-17P&zk4%Kj9=Oh$fk#yb17Ekf7Xjarr:!O: 2HKjI<P1T y6gBgYplz&Mnd 2?0.^{1U8%XjS;d^)3 BeMJW_yt4-NFoU[dZLC^"8c3<H]]Vg LDbhB_(h""ri)1sWbIz"8W)7_4)]X+X-1eaGlD  W=VNcn$  l?Vl"ac?:@s.!V eIKWqGXW7$M-@P{*b(@5Rn 7_b*]XBA/[ejVa>25<0^eioZ%:J%Rp!xc7<Igt9? eCo*t$oQ`!Lrx4d*[$n1>T<Bp4Lvf)e/(eVF|lC+I<1N.na[ClA;kNSduR9"Hg> M!zsX2"k!$.Q_1to!ld*|iqHT4:2>+.-QeWG2Cl8+2?eio{vE>>@?N3c.+Sgu9? uD>VNuY/v%af:BlWbJ*$BievH7WoR+."DpzGilC1(.>ewo][dO3-/ 2_{?xPI9G!bL2S]8V22#wx&Boo"?&#^hzHM4M]H%v/;e_B/lC<U3#eZ3G["G IO",c6+Sgt9?!awPWr<:5Q#Fg/4f[GKl.ON!eX4*!6(*-Qe]G3>2qC1uf)n@$v8a,Z =Ao:>t,+9!YBg1svxW;#wen,;WjIz%hjYvT4Dfn)e#$N)*:mi4n.Me_oT_R8cC!NSb1@]b=UT ^*S)Jk03G"1f5Bjr,,i%*:vvH1fpG&E0Z7`G3>29g4h 9n$$6o0@o Rcw)IVNDU"gIA6+<A5d!Le^BiWOJ>"N!aeU7tfn+o#VN4GO 11(-oemoX_RZJ,Z |E|+Sbc;) rg(VMjB24"1f:Bi[GaT%Gh`vH7ti]3VU{q0G""+*/.Sex *8u-I,R 2cVF;.Z U!! Ek.Rg8]$+jZ_wA!";#^k1=2b"RV+.!3N3Nq?h6x2re[2AG`OIqc ;CRAAbfj8!bBok/_|i<"befBh[UJJ$7OQeYb"FZ:Y"tN4Nlmi/^$B ?oe3[AY.8 kaI?xJhke!jBwk.j9FR!mj9%_*O(T*1 [e[$Ytt)##VN0Gimi2Lk;7j0i^MwV*D!`_z?xs2XC"_J%1s<8#i$-/q]7o59r#|Zr7T$=j19zc,N2(84@5;ir7k{:3;8a,R nD"ACPHt1"oIKd+Rgnv"QijHF*NP</4jdpl4E0</B!LN(G!*.1&CXNDbd3;fb%u oHVEUxlke!IIzlT_+O3$%8EY=*W";+UNU7Z4-Rg)e"rOsGm*NZi%h /oT4$-I,RDjc2G,/&+F{zE;be;rsH$e=DN.=$>w")Y]84z=$f4%hfZjGCW3Ag-*Ur>o4?q!-!{zyyZ`,l*J ChNAArhE[!|c: "TL=9"62o1t[>,8$o!6BpAwf$*:+?ef2yO&3< cO3$<qMF1`G#lVsg %"Z@#h23@ {3(X%R.$ % StC(eiBBtM_NR6xS&ecRwG?y|%RNWYZ?yP2;R aEhY9p"c]!w`<K4kgXX$OqO_zFmjQ%JU3,SI;7O10UQ7gPVNcIg7uNae$!F<@UX pMlh@B"/1!ee_1ve>?/,zU<HKMt7x*j)!,YuC!%O%%V N,u2XE.pUOyNQbeGUCA VyqsW"7L<"zW):B5ds{!b2N%]GCjb*#E<7Yv<4q/&ozN?PW(eB(U/N^p/0M/%,N yd>hBxE=W!Pn]PnuL[h%9q4 .JZYQ)DgA 8H+>s;0QM 7lyG?WoU{ Zd47O:Akg!VaOh?g7-M"S(5k0eDX<$TyhY=(ak_#ZF&YE0FQb)SmO7noet|ABQ5NBBuS[ye8< AlrD2O&Kd![uk7Pgq]H#mPaN(/Th?0]e9 &BEa</uMR 6J^(eSXv( [b[/jvl0w"0KchB(a3/#P$NhQ9@e<1NVZ7VMz==$l,d Gv=qoA@qvO#`87P"Zin <doG`v#Rm%1MA:FR6Bk!tN01v4>eP-) :%m1{`7<C U7du3CKLN-NeYn" A?dPB e`dPmB?uh!5MB"n$7G&$"hI,>)iI-,SK7=22!DH&5JdY@u&qm11 SN`F&h zcUKP!0_F{yJ8*!7/"mz-u`z#cB/].Z).R!vgM /mc<0*x7589.VW?F6nt8qfRR7 )RX!P7jQQvU0T!%AMZ` K3x(`nHsZcz3W"Hu;k=K-H,*yt/YQC>Qb,?Xt XF(9< EX.OI0_ePcu"|+$RN:A1m{P"c`u7QO??&+uQ+eW7ib16`gb $pK*oAJU3 -m8=-go=I"*q4n^SPr?!!Egy:XvXN*%g?//<-"?%z(7=5nb$f?D)ON2/3W/L*Xb H+-G@7H,R a`@@^ @<6$4Cm_uG8O3!ENfplVKKC0ClV=7f$zY0$/4Y={<B%*:(|efji`W>1M2 DdRoBv!:y aLolTeKcq$#x4bdzNey#njj_xy 84(Se:N,^,]i;Ve*NGjHEUPW?! ZM;^MCz{P T)HS^PGB."[xQ_wfpcN".H9BnRd@]$8la +tU3;/ul( *z,`WBU?  [!pieM[^" XL)=.p!--%L]VsXd!{.#wtPBp;om(3weJ ,)[^-61^!N5k/?W7[`B Dd>vF7M66 ^Jn4cN(&I ioA],^9BZ&TrcBp7Avf,8CbYONLpH:<bDNMz6[C:<iFN4$%KtB>n0 XG&8w6bdf!m)aPpb(uX!GRx8 &p0,9D-$Yt_ImH6)D[7ap%9Z)77YO1?tPmyd&E!2)l_v%FV!)r^JC4qblt*ebHk9RjS|$uCaY@LW*>B!FGNGpKH#P"o]O@Pr?xcvx< yr93<Ax7j!m"|EWcx Q"J`Ak2| td2U30e[tc-=:p&P NpaM=`{rq!q7`R6rr$3"BC,($*VD8#z +/)VO%J%%%.HSG9!.,3DXYG$IvE*:>&N?m1r1J(DEO>H6*/{[vS"2Mn1s^O,6$l#PEXzE8()5#ZeYzd$^@1hfep?_4@0wi#8w_l A1^*PNza(QR%zFz!78zvF,kl[!EYbY;<5Ej(C#LHL*`gJ2/wLYBR2W?nOMJNw&x9:"wgPQTt G 9A+@Qu2kn)tgBV+?[eHJI=Rk(?C_H^u-;S>M,qYT/)?WS[2o hyL7T*kF0!4 Jbc$ ZS _Z0Y?rM[I!VI*hJIc,4"]gB,<yF,H%`El7Zvg7p3d2Kevon]IA<)B o`<y5BdnV D)f7QG)NF(DeKEY`kPD5K<|Bp)Xf$*{%WN0W%Zo0AMO 5DpAA=5zw!_AW0O.""V".89N#<4a0&pW6hG9QME(Q=]%aeTsV8uh= 3FZKS*9h`7lQ$O&ciZ4PD#q,yx`kB"t&LlVC7S?$e2t=76 88.1nTSa@a!_#3!fBmWX@<<1`=N6b@;"?_HU YjG=-l6<f$Bq1)LDwA;!I*)sWv$Z%&VbR%|B5g*?z?mYED.:N(T897yo.g;@+m@N[qT.BvA[H%NY6a>n@fb%8sp]/BHGO&LDp *3m/h#kfh +N+:>3;.B G&44!(mzu#8iBF:Z?yk#&Ifn"<1-I" Rx`![59r8:,+C4tb$f6D_cN5#,>sR @X8"//`xm82#!/9X12G#EF" >BhB?wfO4<]HE[`wN%"=.PvJD+3;-Vr> Mr3t+-O$.eXb6?7>*3.NU%e_2Tl<N!"ZY(&j.u*(+u.vUlkO?:K0t_zo/QATnuB,Ab>cVQMfdNt!(cFP!ib ]w&*.JQI7!=9k6-O!-W*0GtQ)#33l)Mrs7VTG`7L IX,Q.glt3yC_8%gG8TBcnx VO)QR1k&F QB.pj;kS=#>jN/*b("O#plWpqy$7`1,wEN4R5.B%nDC7|<J;dimXxNm2ldlV`s3!Zp57Q-zIW)1+3"u^KE$71q/7Wb-ea&d4gehC2*.DvSif*{@3/3p:u 9hxD0c*gD!]lDPn?qi8,tru`!n6"/$(r:%^PV-n.EhQ,`V.KC0`kRNPlxTAdlk/ _8)=.K-d>!)qs7Q!%W/%Xvf"nn% -$AD*SiiJ)Q0A&-psmL 1,"h|N2kB5f,M!d A?H  sUlU ^g4h?]no%!7YoPo=8HL(I_J,=`(?x$yx8YD4Z^MF7!]N*0+S|l@QY!k.# c"/6R"%#fa?REIS#<ZWN)f:$j-4{qk=!rsw) 4ge^C$*N4f{K9BMt^o,jW-Q#H0F;P3NW Nh"my[cTk%$dT]-GrPD=Dz,=0G_j1P!X{ea/RN2ic-k V JS[gVlo!Fm_F;8]2L!/9=lUFQZ_#-+YBkAdX]&)g k6U/"S-h/;YJMQ0m:_kV El;"KQ{_nNl[SJO.Wf/!Y<(pj<+N0#6W6Y=W< 1&G3;7X,R A-ny4er8m!%:$p|O*Y)B%S*f# gM^d,+2O$!TM>:@5D"&#$z[vI9x$-=P@ ppRs)9-"`!ea*H=M7]F!ND3lY{ ;l# bFd8{$![$![b[Po?Mt;#;A6 $Ygea&ObA7hfP A->F{N4Huk.:wf^ EsGYzTtgl gk&8v)0rS+%XZPo1@i(#8^Z%_ot;W&:QV,Ae>>2,BduN2zt$f9NbWeuFfl3W$!pNom{[D3)$!!df:d-?d?U7xy`EYZZ_%8KI?k7A{A)DPgGpzO)bQNdSXer"2xpOGBMOI=]uc#8do!JZ=$?&TL]"u?5%_.,ym,JR21z;(v^7p)AC+N-q<841eex 2xpU_?r p3^N"4{S7!XP[HF;*dd#>;6 QKX.c&;U8N*w]A1.|i!7`=`/&fuJ!ex{;?WY64U qx*Ik7IH.!fy*$7Mvmy&>v1)M{vbM3:[_YA{Q1B a;:7`{"Ad"jReNEy{cGSX*9!Mwx0M,23Q"t#*@#7CF%#/kc_{7Wl+CJZGBo{O[3CJ;5eb D;C8v$Z Dy{UfSX*9 b![0M%]3Q!N%u=/,@F!)Y&3_w7Wl+%{8^7WNC[",8;5eq g;"7P(I A!P,8N#/7 f$Mfx7E>#!fnRy677f5#Oa%%_{Wdt("DT,@{/6:D#(+85k84@:%/dNE9 kNUE05Nm_&3<33#T!`pm%]30ww#NyCvId(Ib&z$e,@s[6:.B*=ebn&KS9nHX D=vl3R_qvNdQPUg%6y7!MIU$7+LdA"nDI:B5yG3%xaqpppK``.=+, 2]^[d;24aewec/&W.IGNe{* c4%Tf!I)  "G,ge#>s6"p)feP&dx- )m0B6-Xf# 26Zd;<Vsueq<_ltQ9Z8Ngq^TA#SId!Q!oG -O[j# i7VRPMO+&BP-SeF=-$.iL[7bWn$EO@qR7qsGg:P`h+NfjmQR%AR|"sR{EW+Z&3%j62hG$3-A%`yESd)H`?Bh{VYI"kC[8={/7q/$3[OYyONe;`P-#5w !cVE*qLhs]#N7Abfy=gs&[A91{Hrq#.::.7bGBeq:uS;NFovO&TojJNmZf!G/z+$#$?E;f?!4g&)Sx%_]qHL8I@QHM?"q#.m9)7cz|7p8v$U H{7l3U#_s n_:VK/%,8![<r7Q0#)C#$9#HH?$0L&)byeX^=BV-2f#ec6`S[8Cqq7q7L%{OgwsNeKn,?5AYI!cw:7QIc<P#IrQN%sIf5I]jk *jqOG9@b",JXp"|<WL]7w6i%{UCn$Nn$ ,z0Qaj!]) >T@&C5#,1^hC`-kR&WA)Se<vZ%.2b2,Jw$$$8_yzer3X(#OawtNfgU4 $7uO!MR,G +Xp^"ue=Bk3oe0%ujiN*FzM=,_AuC+vtj98TcKersSy5!by0 dH?vF$esg!FMCBi.Kai#*@s"pt&yH&ta0%dqf=5.tUM7cgLX#<ki<7uR"C+SfamOR&YoC0UF](:.6sX@.m<#<;N%_Nh^U&WU|,ACV@,-`,D8%g0`7:B@uW3%{CKSdO6"w*IcG0YH !HKgL]#AjG"ph$y8&yWl%dmEk6.n)QN5j#px<oH49@_jO,<XCKUL8+ f;rp(#wsL!KWabd,lJN"|i!vIJ2zQ&2( ppj*xx-CPhYKXXuq:v&_:BoKvfTo-zNlbtn`- <z# &#8w9 Xw#6q[PqQ!6o&C9,Se& >Z-yQ[,JG3sw;T>%7thDxOTg[+NlTTZ`&{()!XZIhA;4_V)l-/PqQ!B*&%SxBp?-x&.j?6ed6,Rg:^&S7toLvfTm]  pI3zZ/YU !JfyhA+aPe#3qi1v.k=I&][+HMJ]K;.Q(dYK^!{o8T277u=Hq,PXG$ fT#)I={Sh!IjFsX)xvE#Nim:Biaso&7K+BpY1EE-.m! 1_$]89pgo7sAe3[Rf<! h`^F|*H*$!QlhlU1U>@%rahvIB@[[&.FOppdDIrO$DVYJKfsghlg&7t`z>v&XQ+NlDuF>.2&6!XeXoD;J-E%`XvY=(tPm,d5y7W^kj),NJ4N2<!RgN_tA Av{*NN2laNeTk4 &dv`!OTyE["4=Y"o.*k2$6TL%a4)%c)e-f,DG1,Z2G:N:Vg>7tCn)jT1QYNcgj,z!)4v!GRRD2"+H{"o*%],zS5r&;QWpqxpBN.=tuBx?;/7:iX)ew8AM^S<,xNfOO{A${.5!M(5AC*y;r"z/IbfyHUr&lkrHMa$$n.{ZuBzq.@L<:Q=ewi(M^WT%vNpU.Dr4*;c!b/LzhG7VD#FCVsZ@L1f3&g1k7`z<P.[nLN5DTe@9KNpesi$4@WT.AP9V]yv4,<9$P/MigG7UO#FCXPqsG1f&lg5%d`zG&.[:uBzDu]y<:wV Gi-`xWUTYNgwn?84@tM!ffahA3;bQ#$L=S`nN4#&x-YHLtVdt,IDi,H`5CK9 EF d.UxOQ#=(!KuFoC&$Xs!NNrLg,y6g#  ;%c8yE^& &5,@Puk>88-D7a%l`79U9jNDvixOR.RS gqRoC):*(!Qg&Po1S3/%rQ,HLB*GW& &5,@Q$my- -[er%uyu9UFH C,^xP#T)D g%eZ`(.]y!H.E1t#"#P"p;i $!>*Z%uN&,@F>$n,n #7`hO/G7VYbeqQAY9N.fE dBh8v)z^q!JfWig&`#T"{ !_w2V%g%`k0%d2eh?.:6$N4EBv$:qJ[ Ei/ClTg0]Nk`jF| -o=!Or6:@AseJ"r"gY=;$<i%rQG7WK{jj-L&KN2v#XT8k49 Fo^L8V8HlNh{!Ku.{o*!McaU&6[.R"n9  $I?<i&FOe1{>eaT,P?FBz.q2g;1&vetr0myP^*[Nfg&b!%:4;!UW7G 6l-p"{!c],$&L@&DP11zDDxh,v>MBwhHfE8o.h7qsjOhPa<uNfkU/j%BX1!MZ,Il+ec@"xcc,<:bAE&%XCk7Dl3K-(fEN2e"%:;x>?7v@">2SM;L eid5F5<@g!corEWIWd`"ucJSd6F?`%yHn,@KlYI,uq^7`w[:_8ng@NC4BW/X/_; qB<0M!N9u!NN16,1S66#&N@4eB*KK&  Xvfd+w!-;!>pyKDqmOO:/ND,[gZQ %=NieWRx(0_8!Rl)K5DeM"#IgY"pvSz^&RP$vN+fMv-mrl7b0 o!958^7rHn6JP5v9 qB?lT6VSf!ec%,:*A,J"y;t:VJ5rv&9Y)SlFFNk,n2W,IlsOX"UMI7s]h26S/z^Nf>6CL$_Se!L[Kfx*A,J#-=%Py3b9^7jVkSdFFNk8)2],Hlm!V8_!H!&]Z#0P@hWNf>BCN$^7W!LYYec*AQK o<LsZ/#%s%bO+7WXe8L,ADreb5A0]95vo7ugBqmTn-BNly$;#&sfN!OjZD2.jOz#"XY/+<W(8&C-l_|q>5$.oh[N5`|Ij<bT# DE#r1N0sHNc5x,z#Cjm"ph%VL)LXa"x%)vM612o%s+1YAKAL(,;cBYJ[yg:<lGuexQyNBXYW|Nr(o2W650^!e0kZa.Ha>!?_,VNNq--284b7i$9  -b%{ 1!FNc7Qpi E3+(#Sm!F j8w,:,s#,!VsZBmD#%{,jPu $eT,8& Sm )N:9z,:&!N5"|  :F c E,9!G)Y!P j.c/* 4Q$!VjM "84&&"|fv $8V!6,YPm )P0!%87%^ B*w  OO,; E2%$5SteV!FCn%a,IN*"|gZ,: u%s"m>R7W!i-M8U%lN3OO999Y,X!) Q#PR6f5 G A%[)IN, n b,91u 5!_!F=/,:&&%Z"l ) "!6&@2&7X$=99- fY 20-XT7XOQ C?*3;Q3:Z jQ7:?&NW&!O+`S^.>33#"2&7Sj=8u&g@>7XQ1Rw9^`^ 4&X*o<$D>!%JA4aVq#.!FVPK4!5*%!G*{S^-w3+#B]97Wg.99,^C= *UUPm-hfY 3.[W/:Qs! E<;3;T+$S n;jK7,]&7!VSd_u8<-5#A,Q,<!V9z%`KVN|(ah`8>qqNC4QT@:Ygd AG2-^VrQ+ bWUEW q*!$62!vG!_33"nJ&eX#@E$%_f( )TuR6-%Nj 2.[*o9,Zm C<Z1rNH$Q fWSHE&MT8"u4(pj.[-$#24zeT!_8u%]=O )UUh?,Bf9 41:W/:U.P C:14aN5"| bpK?y2sW&!O+`vG n--#!0f $R,D0&#@NN*W[h?7j[+YYF=Z/$k$F7tXI:aT]@<XUnIn_"N2p2 Q!D2119K/;*(h`AMQv1ya k6PE)2,;D|YJ8%2%<@jb>4qqC+O9=[RxnIf6"Oa)(/TQZo1:JH"p.#ss+EiXSiiIk645WYfPU2YIJY42"%/B7rL<GBO8VqOKxWnb!I2x$@^_3?"rDJ,L)mE^%gj=Yb2]kOc`o+fED;,IJ@b1gDi?7r^2@=QVUQOLUp]q4#-.!Q2/U&;_?A@AgE/3%iiH,g5JUwc"?@ q9#,KJA[SP%hO8utb7pR+T.OL"ScM)4Z;!Q_CIx/.9S,O@WE^A3RkCS;)kVclo*Z;U2[T6vb2gS1L86rHG?R,AxQVnEnn)-ZG!QTQZo1*Ja)PDd;&<uRZ&&2[kV,QV2--D;Z/J@409OhZ7ptbG@$*T6^R"3n`(&-J!I^gac1G9t)n#KF6=?Rk&J&vSt^_(eCg3F.3;-0]9ShY8wZsEwQd=dXL"zN_9ag6!Jr:7r!Mg*NZ"9f1!]+/-U!KQN!-hRNo!Vkk!=,H r bha!L(CT@!XT!!_![!>?W%{"["=`W#@,P-f){2q!Z-49  Aq{:>#,-n%w7["|-5Di%{&S;"d+.N(#*_Q9.BZ*S|rq"+--s_&/OiRg,yQ2&p:v7P6JNK%|8VU7,8# *N8< (-=OFN083pr1rvsN.K3pm4@wlrjK44,.FPp1x?y0O<4vFw8@^yuH8=23E;"Sj@0Z`/+ineSG&a>_unFpmGSbs2!eHN%CH^_,<hW1vC]U%8(mj/ICTA37tZihC-%&?SdN3yy7`Z_ j RE9 1-o`` = f7nNNZ,!,fXpy NS" `UP7nP&TN81#XYKP0"6eu"#X0OD">W.!=O^O?"Uw#"e# !B%4,h(0,oYY#(,a-)d] j-x5* j]VfG!_O)8@26fS:N/prA+xk0:VF8[p%s40hhTqf #A?,OW>!Z.QrMI$8N%$rQ 9NSK6kMAXDMM;35EuN(l.CWA&`*_S[?84u4aX@(u-_WE&`RQ3Q.B)U-=;ea<:BWC00;f0q>RU,@#Pp0k/(%c@iOb-pEg = )N$eX?8vLd7lVkK 2eWN.fyk=QBSce^UXvLej,<q)S==5YRkR 5cXpwYmF sp]HBkep(HYyNTl!N1>Y,URLZc8&5HDA!<ijN5"nOXQVuiNDNoG>Na"u7w,fE_#6X[7c(0:MNG(|Vm$>$JNg"`@="h)]OC!ahY!R(J`Y T#F!o3&ZR%R/H-z=dT2!_T^!RF,N!#(Th,y#@w(#(-1CKT)Da:V.LEI+tMW<a77.*+CUyiT&fG#&%s*8T&`QU&@[$Pm,|;%R68y<9,zQ%+387V,.dOj*o7OPU%Z7P-"<HwP3[y8BkHEpl0mvHuPF;y6>VvIE[Ik%]kcVMpvF;shjQlVpnSe/+:FfxBp]9vLee!XBo`PHH=B6L 0QJY@et&2SkTX=1eb#sSd[.&C #KFk=N9H+edYKf=N$?zpyOlm@Nf-#YJ NmA `hc,WO$9g a!3:QPsf=N5%g/: h0UN4#[=ATF!b7c%hAQNi)$KJ#^/4TF <Kb&K!{ND)dC7 n!yI/(<Q- j&5`q!a3%-$#DN2#(2n-j#<T8:VO3.*&444!WCx.2#@s/hh-ErbQA"Jh0-=jEPm"EiD&`1.Q :!$>&aix$U.E)L,:$$S|.EV_-`QR$h8u)**qQZ[d8w(Y0mR9b)-_*S1r:@5/5F)[A-OI1|?8y6H4X 3A@eTPFNVL2*jYPmBkPn2Rh0 $C+YLpohyhCrkf%%_kF:Bq^^_7Sk?Bk8-bRHHo^Kv-%]I%_fq1tg"[5BkNf+5eYU+eT T99N+N8>W7c!kN+OM8;:Q$!G(NH=/ 4"8/2 G$>#" ->[NH-x)]J[d.NH+pHV o%n G%uvU p$j26!`"q n&1Y^!_)m j/ZNT!_&b,y#@_s!_*TC`#@CM!VITZ6#@JN!V><r)#0Oz!gTaCpQ19Cg{&O05#0Dc8]&@/x"l[*:>&?Q]$$.!m2%|i[#0.Bzo7/z|);8zX++v;m_V9pW"#P;ga#0S(v11:@285F>iB.vJx`JOvct7r4y6;ey9Desh2illN%@#r2,R`i +C"Po2!Y)N%>*uQ,PNC/+,] 3Ct2w HN0!IpwDJ^4e`87N+N]t`p{,i 0f 8[q*efk=f0#vpqN8=rfX"lZr &/qN5#^Zg &VT 4 MOP"1"phb Kg.O<+k@X%X(8!D-7)`#^7aNi4{Q+ n#DY|-x%c n@OY|/=@6!NHj8H"|*@DLH.C[%R.[h/&a>L%:+^E=+|9r:pTsCK#@?)!_CeZ_#@Dw;L&`RcQAMQ;K&`0r"lgk;;-=<0Rg9^o"%Zi_RwLZzK7/z9T0LY@Q73;{289lVw$v;i`7/1WN+WRC4.,yVe?";h1G?7Sb<uSe..Bp"r7GDZ"r !poaLz]k3@^exN* #e[M%n#ktWsq"k`_zeYa>C?mj:@BpSm1ze|*P BW _wfX-AYNc8plNE1S 2NHDyed6JebO=19fW;D-o &Zj#"(P;l!K={es!sl^NH j:y$1=L!D#k a*|0b G#h26"f0UTD#j [(>`L,_2-:f!N2>=p#!/2"d.p2w1n*W:.&u&^g2LEY9#D2T#(Nyqy#8P!<i+p[p(D[J"m&i."Q3[XPD&O0M%Z[D!_,ztVQr9J!p&gQ2V:8TR8,; 3XT84S-,8P0!g7ipj1rvF*0M>1u5$PnGE:?xa,8zZw>F;4fFFPmHX8vy<t&y7sa7P1xGxHF2!`a)PkNd.q>ot,:EfRH2%l|m{C(OY -`7,?q&`kvTfV=/BxQ",<g=&"7aV]Bvep@C @Y|BqN5CopyR,rv 4@<pyPQ?@8W!)-qODp5f4!2[!Nq_> 4&,OZR|Wz#3/1btNg#Y@B"[X0!@&5kg"e"uU #GE{!SzYHEy4yS izYHEvEC6 n#DC;!_-ACK#BBm!_*X8<:s8J!V-J!:#@[dg*&hNB#@9dfv&h9IQ1gw:%&`RlQ .X8#&`Rl#@[Shx&a<"Qb.Cnv&?ixOh.BWI((<*UG-^W8));g42.CW0"K;f3 .BVK.F;e3&3|VRHH8x4(%ZVNFBAF3Q=-S^HmLY1xlSN(EY/(2*m@blEvVK,TrQbdC,Z`,Dk_EWBt_3&3k`Bi7a[4k2e[;E,QYjple|>TBpY[N%OZ>veYNiZcNUD1,ANHij 47u!O &OLed Mpp!mP/ 4 N-iNH%dhQ"8Sd G(=#" n($NH$OhT n-pNF!_)Y n&.&$$L1w n#?8!!]:c n/T=W!_FW b/W&1!V-5-$#8NH91&_O7#8(R!_`l-9#03n91&X!.#09I!FTP0#QAr]g:&?i?#P-ogR&@#Y$E8v=x/JW2(#-cll&c:#Ox8|Sw(DPoU9,< (-=Po(:;dS 7/ON%2AB$83"OG(<7P & 1S^)SB/ $ 5:?)^J%N!/GO)%X Z"kN% 4eRHU1vefAS%kkW1tC,Il=f>c@@Bww]7W,P!* 1a/1z<@ f 1 TNk S-c 1Ng7W7r8;N2OX"3 A!-9)Ng#Z B!LBw(#6s5A{o$Q!>"l83!A!fOD z@W#<!_ h$Q%p!T93T%3W@6!P:o&C#$Kg"d"[8k#i#:!NC@NF!_8Z!R:o%_#(`yZ*&/2]=$73[p&&?Q91TqNF#@JMPuC]!.#0Oqgs/xR["|%!:>0-6(XUMM;C7/GR(u<NW{&P<$!w.C*O))R;Tc.B)d&bR8`Y,8)U,8;s4g0NW6+tRA0R12)nFF7R4(%Zbgr^u"vO<QyVFFJ&24q#VLDD,:2.cFPw?|EV,HaE=1Bt]9,8mI=/CDS],Pf-_w85OY,@Ytq08$14,@N@$97o8%`gepDxedNif:Nb88DOP*LgNaOjYX G9bNI&IRU ^i0f3#^#"(JTJ#!"6oSNi0ihO%(3; h#h,[#[)^TF)f@;&K3rND>k"m!R@LNJ>m%{ j&/&W#e5b.s,%&E#(F^ v:oTH#)a)-=T(rIQ)YnEM%k3":B,8N!XT5Xie6*7OY)#PSC.!F3&OgJi-&d$Y)).BA+%{$sUf.C*I&`R`(g-`)[/G;f2g7T((1rPnsqK4wq.gRM3f/i)RDPwnwm=.4kt;@$3I;lVP>oWz/-`i"mAUy7YAn>/1F:Sm,iU>"p=6Bi`%erHKq"a/`+nF,ZCLRXY=hR-AC4YI,<gM(H[4P_7WO9F>C]8XOO `8YNA ninf/"+OX!L ket*;!N h"3ex$s-{Pl mNb!tO_ h)#Q! o(( h#k@.!S%pT#0g`@I5<@S|!_KR!N$f OKJ?z!R%z2]"x4k9 2,Ti!N,aqL%Z=r:>,8Zo=A  jj*o9I&O9 hGq`D<%{P=iTTauaT0DzP],yuDS[.T#P,y;e(e<+?B6kLzU$<VA?%|R6UU9aW@)j;naN9YW9#qRU37:>W<.cRA4!4j*n =X4Cb>S0$FRE`:D63)vBsd//+W97]L->VSb{@@%@5zq%`QSbkHT&31rQ+eXYC`KBg` Sc7sC_`$,anEN?f&HSefX]7R9pBx!;[lY`9*JbeZqu,]!%9)!CBGDV!@i5<R&GC/O^DA8Nr/Q)N<!Vi7!XnE!t#P>% Y)sOY(m&3 =/G(42DKu4w96!P*/l&##R r;%sN|.wEEZZSP u::Mrw:%R)ohK""UY*F<yGK_s(%QA!h"W&1!@#A,m8qS|,qh`0.!%)ze@SN860f,yN"&84!%@XuH(,13hrC)IHEXF6J4 /hZ%#k@=4i!,YzNf7P6?VPU77`Dv0R[7TBDKIs/&+W`Y/6pH$n=9xQ/)8Y$9)rX%,Dmj8y8!n&0lr hRvXl#bj--)_pwHg)TF Hipu%kt q&LK,DC+2<,mo4YH;g;l7rNhYJ D-%ql E /i`qt."PkP;OEPR7lNtun ZPW ?OEP8f2"+Er!+#] V/I#+R&%+kn*i0_OC(0nU"e$<!>$h**"S$N!H)b&O"[$Ir&*i#5"&#@2y%!Ss.w<cl7&&y5//oVfE<HCQ9z@,2_j %9gJ&p/Ij 5VPi+dcT$E9-i7Z#QsU-99s3YI>"<a-=8v(48TS4.cbRX4Ne/|9{(f_TPmQ988oDWf3<be!*>`@X3;Zx+3=.T#;eK:2VeTUzEV2$RgK<].:G"oNJa?%u0M_zVV_veTEovKY=K5NFyM)NN+:bHJGyY@804Ceo8L:e0/cISjCKY@ :P>,DOg;)8N;V`#m{r{YZ8%!Wey9beygB>g=BOrYd!+O^f>P.hdO(%lfD/2,d]U-6;:&V2>!u+ i;&`8"Or*pfT&VHx!u){&]*M0s[-$g@r#i83aw.kf`0P%xUv)QY[;S,CJm))aBQw^AJk(]:=0<0uI/VB-C0L3(NAo9svu|3U2SW/F.-w3K/xV!?WdD^=,2S[<IC"YkR=$I9B).-^9Yv:5F{ePPMCKf6,w:_8LdwQ2Vy?OMD;+V)jr2(LP.)M(I$6C$IkPqJ%ilIt4b],>2lV:HcOv^7aD4%dods^>R4spo92YAI1[&=>=`hG Lx2NB&Bq4C"{Be`Z(y;N>@N2"fg*vf1-Pl N[Q77nUgZm7ZZB7h <D;h)f[Y_YyQ Ns"3Q9NT#& y!.dS#0E%#`(!hc$H(==y.>)m!]$cCL%jofU3USW3/?QC!J,%W!"i8T(!BY7x.{,(ff$r/f#rs:99$^8["W,<[h=Er</KC;CM&&8]Pu+fJh<HOA%R,i{Ijr6KZKW?`Xjb6lc0X#H7"#4B*Y+CIKTR5FA3+tG  q6Jyx!HL]=q2VsZVqL]tP,z%kBHK6z&%>y:EvEZil)Mr6p=8vyD19vHVVEVc#ZgR::N/),PDU8(C_3f/OjwkR8 cq7WR;2JBp=W_{YJTD=Jf-@Bq%%_./N=L?,:T$,IN4??8Q7`BoNGV/,O8*?C7b>XYO iK= Y8yg7![!S!{)R-{*apr Z#=3UO8dlf/ u$SO6&Ghy%7d;!85{qC%:#/O/!ff4(a"r2{!mh|"C0(ZJ+9,r!{Dx``$Q:W"?/&Tq$U6Zs2*6N];S-8[d>:4VP$K*qpS*yfg]A]E:]&p{mGk=q3/@C!m?F9rA4B=rBWExY8aLks DF<.|3-k3RXG"Yb,kk1<aF`Z& Qk4=:HzZ^Obk78|MBY8d;;#L]&,0RaF^O?{VC/(-fW:4n5*Q&YhRI:G@=ilYCyxyC RRKq+$Wsr,bAFNi&j:I$co5{oI<1xef*sB| <Ff,U8i 5PS.+,^DV7a7v@$ CNjl ebTGq!NFI{eV#^,[S#C[9aS_0p!SmOf9""^o 7,I#^#=q1!X(?TG$ca^!_!jnu!"N^")!c5Q/D2PO[-4@b#@J6(B&SIF#<?c-r2kK?F28kIt=^B<"pOlOn=EZB/&By"`Svff^5,iIn%{L#qaX#`F$=42,b+5_lRg4@/"VkqmS"<({V[hY{"%?Z;V/&Y{.C<l0v3-Y|NO?Z1y26U(2>?X(*4yP03&IN(,BTQ"6FAo%k@.Uosjnjt!oJB/pr.3$:bv "%bPLvy,;jc:D@(ZrSnejhE`3y7CP{h/.-:TD==vqy]YSC/7^Z7,` >Sne^7{tA >es&O 5!.9;P2>  a iq*"d(3P,%#DNRU*{82QX^k Qk68-&9Hb"`"081!*]D!,!VT:!;c !B+5 Z%`=e(!&# c)Y8*394`Kc"S5%T{+UQH"P3>Ct$z5iE-"`l?#y@ .V4P7l;d,09)(vNJQj&/9=*NYBjQblO|-3;kkO9lS+,=RDk79ZmRYY#0W 3|<R)zJ/O{7pMpXuK3n83]c)+U8wO]-^K73K4c2.5$ZfW9JOf9&"pj@DD1EV3&R=p-%[N$((r<^d(-e^5AlVPs9sPs;ty7NNOqve*%oET)CunD&<6^CqzJ@!edcH1{YZ],7prt=4YZ1u7kr11wg::AfA84vKNLVM,E gBm8NPo,DOK@!fO$7YFNwbgekR>N.#F%bN<"vBs" %j ;$cYB X##ek&j=8 W%o,U!3%s Q#3,U |%w `#x,p!w-:fM$;,q"/,k8o$YYf";FaO"$fPK"G5jf$$f.z"S*_O?$fJdO`*_RT$MJgO&*N<M$E4RS+*_u #q4BXH)|G1"|4A*<*.Ga"+4cD#)[HF!F5Gqs#@HG:R5GqV%JJQhC2wpl#XImi0+3r7TPJOeT/&r8U5>Se]--poQ);#hP$Uy7Q $we[(DvHSexP]6vUa?SvC,VPYZG!HS=Nn#NCOJSzC+7V,KyxSjf61y :,{k;*sBm8+qL2! e(+7k8|YF8,^TC&"+ 0!>:BYUQ"4o8,!J,TP_Shf-"pHb!7"q Y!lq&!9"m8-#r,J!8%[Na%=%c!8&CYm"Q,Q!6+W,w"G,?ft%,,N"K(j8<"+8N!%&Q9S&/,`Q5!kOf&O/kQ .+g(&GFWQ^.!9H&?Qe#q.!mV&?;4Qz-^V,%{;E##.S)*&p;D/b.sUj+;:@]{1 U%(X<H.e.RZ`Az9{/l"+XUJ2B&4c""YzME?y6.zAVLIn c;fz b"HL{O-^u(ywK8xa0Ps_p)Blw|HHpqa_=.vVplpskq)S 1"q%g/IE_q/w.k1f8bkeht?`+ eSeYPr57cf<inpoZ!%o8C9! Hf|vXf$9#YaNc]<N1hNq3!$:N rPwC7!$k>fE$Q=T ?%k r!H=X!f%z o#LY^Of*%-* d,aOj&yfC#L,@Ol(%-"#L3*!c&t8O#H&69M(H,Z#i/^9M&O8CQ1"C8u&p0pPq.JO7&p1MQ9.c<Y&`(LRs0^UB(<lC-U.SNt&?7pRw*oxP$n6+5")zN#$^85"A--OJ%R7Q$;3;OI*J<K#V3lNe(mBG"p5^R8+"BG$77`VL*s@="n/7b"%oLY )1z]*/,x`ihn$S]y89*InN+0o:@,I()7y3=ekNROLC(9;YCNTm=HY8WvON4R|,M7rYCqG2[Sq fl^7Yr5 6NG-hC584vZfIZjC5ORn17e9(C4 u:N d!N7n!>"z8=!N,dOmSyNv$DC7Oq)Q8I"G29!u&48G#n8-!u*%8P#o,x!s$kC]#i("Oh(e-;#i3*9Q(i7i#q*]99(TE-Qf$AOp(m.VQQ04P4(T5)QM0]7o(e) SW/hR;(e?hN20LGa&p>sT@/h]Y+t?7Y+/x]I#y?bAt.cXU)n=-D23;a@C3?yJP(#d,{B8UOK,(eW&CL9OIv-b"iqAc=0K|XVeTbsBhvUsXpm9:HIPum:]>rc;iHUm:Q"w+HIHfn`PwkOWu7]`9%eec.GB|3>Ea HF?kG,Ze]q/wr=G:@=:go`_Sv"T;p,mhA,RPvf",mOI:P o9"q5 e/>NrOPq1Q##&No#(Hj :SsfA#HHi!f)OfH#RS|!i%]-. Q8&!Z&T-(#<!qOY%I,v f%v8<%D,r"`)(8q%F,z!J)qN?OXCUNg#47U!V,oOO+l9 "t--"?Q7Od!pTTNo#499!h!#QM Y9:!P f#0"|fg#a,XaF+CKU  6*vG%kKv%%%Z:@*N86FN6*w,  Kus6- wu>sImt?+SvGeXBhpl*Nz]jQK4plN2z]k>HEpmf$if0u_2*:>B>c,@YY)K:Nu"eXDQ (eawnemU$Nc;#<I>2Z>HDC]<I A]*pj8n?8VNW1r3!/841vND-beY!JBo7r6.N+!J)R Bn#,@P.hJ7q!K7`!>"y 2"rN4"-PxN2!|%v!@"s ^"[%qNe"zN3$<,RNc"v7o"^%hO?%:,X"[&Lff%:,c"[.Z&x%BC5"h1=8s%:.+Pa&"8,!_8PO3&(9M!Y2mO0 COq!g&P f#08b#P6JOh,(D2!6&U#e#b[%""&?Q[$$LZ$M%ZPN)j-_(]&c;/$--_(](DQS/x8xUI(e:@/x:BU5)I:F/W/&U5;d7R.J($%_9)S^)Y?ystYYlVn-;evP[3wneY>3vLYIhBeXW0%m=N?y -Z_m{8UGa1r`7Pq7flVN17ps^NA de`O)pjO0=o%_jlbdBp88k2 C-bq*P6:Lf2!F7o!""{82!QBh()y:/9 L1z!@"l ^!w%u!A# 81"dSr n2HqJ"e=7NF@/ph +=Z C(8#- fT$g2&Q8t#8(k912wCf#<(_9&&W,Y#LZZ9M&/:0QA.:N:&p0R#q.Beb(<js$^.cB7%s<XOO.B?#(4:`PB.BTA*_;#_4-nTd%!;#^3.sU&$b<H/)/GW0<,;D#]  K5pl-=y6DqI,&p(D$7-f-_%_0,y;jQ;#sZXDpoeX !s[YYm{--_sVm7p)k,@W/]Lhp-_2.NBhC,HG  H B (N2+Tk4C+EXB{cG &C-7R7n2Wpo C*rN1,zHN Jr67dOJ7Y l],N7OOsbNLOIYM k//7m!R -P hF7l!F`% O"{N.!hS_ K"pN;"U%gNe#$,h"$%kNw*Oev!{2G!#0ONX"/,Q8c$=,L"+)@8P#y,>!w(]8m#i-xOx(uNT#y/pO`(DP##P1)Ol))<,#qG`PT(T?Y"|0LQj)9B/%!0mQS(#7P )))]:%J2x""*Nq.!62W#u)j@_+d/i<T)IEW&/4 bf#qAG7WHEpt  N# )?ysZ6Jy7oJ<HSp:o;m-nKtN%,HN# )9Zps^nwneY4Ae`N2 #eX B@"YJ)J fW/vh/X"mCONdy6 1i%,@8T (N@!H ) A!J ?!F ) A!J ? ck=80vI ? j"zeZPzY_Nyk>f?OQC0OY"|f>!RT% 7KR8=!qeug0V`f@!q,Z!]EkqT M=TO[WG i/Q,k!]2k84/ST$g0&S-F#<m !N>*fD#0J>97&OCuQ5.9g8&P#m"lT@7O#8[*!TTp$5#/[I 2&piQ#X.0  &I"s$-?WX4/8.t+[=nTL/8_*)r>zp91Q^c6%>sAI40]s/?AF=t(u]3[tBO=/;;^O_6Ku>V=U_<^U1s=ZM5Qtbfv%AJ@#_uY^N2N#7p;e3tdlsHBGJO&|fv "BxBh vOG d7zhb *BwR:w,29Bp,M6.3-Y|@$.x]-2id-pq gSa2(f`VRR[Uk2(7{Wzq1K8hQ0W,Bq1&G"t E)Mec@(YAc,v^edz#y4kT,P%n lY9 E/7,KOp#1qb!#&9Ot,eCe*B%oOp1+CM#q%["$.6-.#m&h9=(dD$#jLP9/(].hQb^&")UH.6Qr/pO5(]JB#X]i:c(T?P%"00%@(h?[%:/h_B(f?X+j/x1S*.=nR]0N_G+l?Woe,::D,<,oVc+?;`221IUn*o:C,L,8S^7O<M/K26U)>k7u,a  S[                  4Nv2{Q3 tjM|zuKod!JmQ%5ud!Mm|!W!3 DYtwuC{;^B;ZVELWy3{xl9E)rq{^K^bPK2^ieF{S0!A2{,v!pCv#yp`A`qLp{zI]ggj!XK3 Mis!v!qIp!d!N {vB.RK{ay!v!{^|!|!g!R+zo@I:*p#eKe-rok+p!d!K2p#kXE)x]{9o=d!K2e ,7eFy p!d!M|H1_1y-Als"k,xzMcJ%W#5u{eMX{7d!MuN {|uK{vs=^!?){uv!^<7Ne%3Fd!W*@Odeu`zWwXN {=4J^"BSc"zRXam W!o=bNpg{|zO^:y!s!uReNEA{veO|!xwJZiVK2GLKNo4w.m3_+{=y(oZiYH&.Og#Xp{=v0ghdHc=K2<_FtV4tIx:]`><E)s!u5@vzPJmj(y*][v2n22+=NX9dcA7_imNP8]z+7k-p@^qJuxnt02Hs)5lJIJ@E1y3{[L>bWG|ov>y.VuptV>IcuLb{Wjs?oE0i[X6XP6Tc`Wfun31AXX2@P8khTIWZTE3vDX6I`p5PuQgVFK t2axv);I?AS5`vm#dFM&E06xobmp3 gCXrp!cy/Z3$Y8cT3:{;KLwWA|uQ=Ks=J(M,Lrp"7Jbvzxa!JZt.3nFo9e{/_Qe6Jhbu%<+NiZcfl9.VjDQdU5v:;N?TnOb5^$DBP`[_^1dgJD-Am@mf)h&0V8dgW)*:3dF+2Da!m!FHmk^;<Uo9oj0(f`9.`<T rNgN^3/z8&ox><Bf<Dc;3nB90wQ@251=ZS;]cA^B<!G+`uq8/uc{z6nR5rDIV;YuGi^B>qXE]IXI05&K?<ZhVz2uI`Dwg#^2jdXr?k1PE Wc*j2S6"X))Z# T"&VHkt6o^by%DCLc9W#6^JZ>kc5X>s:gfo^o4_FjBR/>mnTG8K^ad/w8nR))ov3mVK2lFI7B4i@x=tXm#de>PD/m6tT%@?HV5iWjlMA`m<f?bDs*4&b2u/t-(j#)%t=5Z-o&#YZa2Cx9?s)i)cY>;W^x|tR0wnp.Nd!Hf&!5H2{[Gg"#2%{%8- 3"L0S+Z!@R3,/@)[Gnv!WDYsY[]|&mB^E1i:t^<9Uqcz<$W:*P/{=K$TK ozQ%%m#*[T(:XQ8L3N%|YRj.J]FeGup!][2;WLllUQx5(^WB?|Z#v!j/GXdc^*om^Yu1szVdU8%m=H]M&M]@R>roj#?^[g8ZVbEs>&<0OsIWZ0a4@D]>Xj&UA6%y&-s4^_3 .OZ7UtleYuc]-2V4/ZH0o;3 ]ti(i[V;q>a!IP<o?8^x^@<fm3[$7*pd5CdraPL|ZRJM%7h4FpD[^CnHO?IGB1i^cMEBmRnu?bu>+gqFxE+]pbJQflGLML`A.rH2u]oI[{Hs_Io=za.K_o61P]H R`Ym2u9bgs4>h5xnpDqGcTutl-@tLLy2v!qG4FV)rM3j_Gm!F;3ad!K!vcdFJxKAozWfK)+9qH6-O6vdGwp"5djVi;xJ)+CG6;^EzaMnvbzH>9qZ_Kp"5[_,[:msxoCGR`jE5txcqim{TwJ]j_khKIsBu=p%flH@{^nT`^_amO6bd!yB{K[2d*Jwv (sDzy2{1NNruq{kGyt77F7jXd!K)uxjbJzeHKAGTbZbqPYq(o4njho%7i_az0_S8{AfiG,<9a5yt7:vccz-TyC%&atcn?gvB{=eGy2jgpczaJxr,AmbYIvc`<u`v?@i>*f^EK1{`p 4N<>g2by%9pSRdc<xnmTqjB$flG]o|SAriMnvbcjC{u^<1[xx$MJib{=eHK j_hnGedcfOLtfkJ<_InWz(,(u:ytIVp11Jp"5;J@UT{-_iJmpDqGcnJ|p_TI{;yBA:@C+Fl:tXM,bYJ[Fvo=za+ceFx>fhAmiM?!0"H1u^X/Jxr`{^pczXJ|s2ALSLw(12b]6 PRl*UWIaK2%+cz_/,!tX6MJso,QP0oC`L{h4dB5esu*d%|_Ng*WD)Xa1qgz.Fjwyp4dAm6W=<BL7.!X`d(R**975t&nw:&0349hV42tZptzwYoJedxgWziC{sa@d.y3bJYk)ALSFst+JlNJSmht5n&l%j n_0q[&^zjg>0.Bfn)wEOEAX Rh`rz7d!(skFnaA=d@UGjgC9%5F!E g5^Eyxfap"Ac[.svPYrKyBb1;@X$R%^)OQX/4p&hr<F=3q39?<gtKs6wgs@7%?u6p$Ym3Ue2I7#A)),T0``3W{E@t%/m04ysDhf.JeCNl,Ka4I17xxmq)+xts *5lK3rB+f,Jq@egR]I5m[X-|V<aFw@>/zkBLFqb2h|57nrkXd0iJDDly[UwyiCCG;P</DL1.`lwiS0onyj+v-A3N_,5/l(o.uhOw0AM-^bIOB.fmgymSp3<9hxVf<{JKd6MgE29Vi;K {[ptR9EAGNH-o]*)A,E3d]T2`mdJR&vVqGe(]jT1_Wp-lo@h1XpsWs]!5SjS[wU+Z<H RK=T/,9[tW6IA&u_A2#qs*D.Mn=G?V@5t4>>1pmGv@)L0<ID@n-=p!fuS1b`nihHW4GTxnximtLp[tFHGHM&EsM8eIJHP>@(S6nNu-DlfP+JO)CFo-Fk2[mDk)+%PVt7W>AjBIqa;o`f1?l.](o_3k4/i81kg]i=A@E;o$o=g/aRfFfl(YC1ZJUEIVu39ikWJC5"YWp>_iJLNo>q<YeGcf+bm3zD75s2RQR*30rZWea.[PlM*&&ZBQXttv)8*Vo^GNe?2TDGV=oI>6A:hP D/eJAc^UC;;>]z<M0y;)*f-42Xjnj*Qd_`]6J^ aGa3wx+>`RKy3y]=?E**ducK<tu_.An/&E2ShgbIo75,7)mtVr-">nKq<&XOPGi{x1tK<BsvA2`LTaHQzHR%J,_"`JCVJ7So#IArst0A@Aq8;wMOK^[[hh.z-;nq-AAmiB+[=hW."IA81?a6J4]t=:A4E=oNoASqVU7.s=/D(XJ4JcsQJz*^FEi?%<D#RM_L*,NRaBoAM(_((%Q"?g*RsuGckhI63X]_k;SyCU)u&TY<;ARlJmL9g1"cNODelxUX&{#jl^tw*G=s+?ZS>|t@9cK{Tmv(8uOc5,)*i,E9pVF%j%`FuI<Zl,V`;J-19ln5)(CUj3G4;Kv{r-D:oE;Bp2nk5/t)6[mLk+QOB1zk]]vt3tb7ac5YquyYUU0HttP[H_4-prL>hYo`3VYqVD"(5po)C|z0<WlNc#qV8+)L.oHI{>fL?nab5lyPv_@>X;ZPjdXakEXIh1IhdvhT`rZ7nf?^sz-Qm _F1>W$:7]W0rWA^1nXz@^6vbWg#q@Hr%?dF^H%BcG4iU`E_7gs)4"J>l^!PZ-XzRNVa:9Qk%FNsv,e3II8FG2C3QbpebS<gqjc65<mCVVJxo,;i 3cTR5XkH]j26F?$^XHGmF@pBLWHu`TDYH1uUm65;Unx2rv^9CyitO=H11H]Z`)F|K#vJx?3BV2e-@N#@48yw{gEb^FFlwX+gmtbluLaB(Pp9RPCzRJI+JA[yiSO:J5B#i>?5Z5qGz2F!@O^JJzG@Q;g1F"7ona0>XE%TJ`k%VU0t]<wuECk^-CtzFERgwNG1XI=Z`H`A/A{%-8lDH4l1`g:ux^o).Nr+T1H)dV9@t.+o+FSBqhziJwqGba#pF5o2P8`rV&>[s4svW{U*Py;]q<tW{1`L3rJIZ-weP,`_mYMqI7B2nW?@Uj=#:]Uv@q8zRf2/Oq1=X/LH`L[9^X%P,p9p!LmV,;woO91:h&r.+*XEvRG+P^>0Rs2nK@%5p*#R7xV<tT>mQT6L/43c]x_]5M<b/N-;?t0:Fkw8e%</?K`,ml;:=xEVG[clsHYG?3oa`j1k^{cq#Y;K]T>dVI|!ce9 Q!&>|!MZd!K!IaK v!|!y0pg|!{8v*upvDLnm&{njXBfe6m7y*_G.O>lW.{<`KE k+5+E!mTQ%5ucmE j!K$zHMl{xov3 MishUeqij2u;zPbXK!{^o=bOv!p%ylb7p!dDo,^"BS^(M8cRg!P[{z^0g3Q!%9{v?>ROV4tIAmKL3$[OlkJZiVK)GlixHg[zs!i;>h=NWu{va$W<;o^fjcVy>m]Y3b.Eg Lr49nK{l_ *jIG98{;4F3(sCj@Vy_Fv/cYJId x[{vafY8x{nRd_Juv3j@V8^*E!o=?)wY{mW|yha"<%zso(xvE2j@? Gcv0i?>5+U/Yi|RWnGfYU,omtGgUWF?%3 6QEEirQ&u]oYUSDn3$]^J8w_o7DE=N+4i[Ox]V/r=quzU[[buZn.3nB90wQ@24^2jdWcJqqHgCR(ydIXGjcY4F1NA|^mx>c]<1[tj@K GJJ6g%9U30Cu3bXW4=o|ajlw&0)9j_RZgU:(V8un6!Q&G+qPf^32J4F$Z!=v-P1VoK]0tOT:g-IMv&,|3!JVg#E a@< K qRsDuzdg4F?3d!3TzPJld@4Jv!lmV]j7tG;9d!IRWTumnu>yY|^x^@<eob  #[:>  nR A#IsVN!#PcFN&!" b)Ix0&O,8 $4e7Q0<&""zvMWudn7O =eWN.xp+S2nN1 9#/  $& cNWi$!Fk*!BZ]Z>  9W#{"K:CY<>F(xRc%* !H<5=+)empuWpI`330L (Jo(eUl +Nj;d%[-^)I $Sa/)ES!N#2sX>VFZN! WH[k7t[+l.2e`br4g  #`8` AC,_RVc z2[%s   3))!NzaOIIK$l:>PT  $z:J)qSp,Eos%%2X*o  zJ4qDlN|f,phFckZ6* (@b9ZY6$X"-,>Rz2xS[ LKI].UU5$)VSwtGLX  "?f5q*e@O7I"!D@QhC  !)RRODoDHEhx#J:= j  2X46%W)T=42.0w,2Rw !6!s>5% uen:ojIL83; (_vk.sj#wO=ihXMn$   %7cwn]i1n%7:Mu&($Bg Lf82%swRN9$NHEw$B  #d:W88KUAB(NOwU3Yx  4C-u#$ +Bk@2)x=g7h  -Ac*-HvrSm[;I/9k%: !GAN!_Q"*fDE6uY3+LX %qWGbd=(Z#o(*#E2gk. ;YgsazY?p0E,S?LDs7O"$") IpXy#_X8j;4Em  !s)Z"!Ps6meb%zF_Bs  ,>Ex+7`3P{";<M6!RF  S<[lJ1!:f-?y>@td/& "@!vgm<%RPMf:Z `W=- 0zr-er72%+`7`?%y4ph!2!)epkVjbL 8;9XvLN! K%5O?6NF;tf#Fh:k4  +P6I%?/9IqbQ/XX[Ns  ZNyy6KTM @ baEMp+3 #V=NC"A"m!K/)!(+t/& "%*F>-C,h%rn$dt<z,8 3cI2%YzRN8[NHNBgb7O  25e`zyr11sy;eP)I    ';
const ROUTES = [[50.36,64.14,0,.9961538],[90.2,103.927,0,1],[169.56,194.5,0,1],[198.45,211.5,11.96,1]];
const REGIONS = [[91.2,102.48],[102.42,109.8],[39.16,39.96]];
const REPAIR = [[4021920,0,128,1],[4516722,1,128,1],[1726956,2,128,1]];
const TEMPLEN = [2256,1476,160];
const VOICES = [[[2185,389],[1960,270],[2414,111]],[[2574,289],[2230,162],[2525,84]],[[2863,39],[2392,22],[2609,15]]];
const LIVE = [[4845,5040],[5080,5355],[6849,7844],[7980,8488],[8516,8529],[8543,10072],[12828,15300],[15312,16475],[16507,17612],[17714,18252],[20484,20496],[21948,22955],[22967,23005],[29838,29940],[29995,30050],[30600,32213],[32342,32349],[32364,33484],[33548,33912]];
const PHASEFIX = [[2365,.6880051],[7963,.1422605],[12495,.7944744],[20414,.499007],[21930,.0517862],[35955,.3354844]];
const BEVENTS = [[3440,128,1],[3730,128,0],[3823,135,1],[4113,121,0],[4206,132,1],[4589,128,2],[6127,142,1],[6418,122,0],[6510,149,1],[6801,119,0],[6894,146,1],[7277,141,2],[11505,141,1],[11794,124,0],[11887,148,1],[12177,119,0],[12270,146,1],[12653,141,2],[13039,148,1],[13330,124,0],[13416,146,1],[13800,141,2],[14191,148,1],[14482,124,0],[14575,148,1],[14866,124,0],[14959,148,1],[15250,124,0],[15343,148,1]];
const PHRASES = [[0,2,409],[2,2,881],[4,2,1121]];
const BVOICES = [[0,1,2,0],[3,4,5,1],[6,7,8,2],[6,9,10,3],[11,12,13,4],[11,14,15,5]];
const CURVES = [[2902,55],[2624,37],[2661,27],[2957,78],[2688,80],[2768,41],[3035,45],[2809,35],[2844,11],[2855,28],[2883,11],[3080,51],[2894,21],[2915,12],[2927,40],[2967,15]];
