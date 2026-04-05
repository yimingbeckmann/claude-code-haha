import { useEffect, useRef } from "react";

function PhoenixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const C = canvasRef.current;
    if (!C) return;
    const ctx = C.getContext("2d");
    if (!ctx) return;

    const W = 920, H = 1080, CX = 460, CY = 400;
    C.width = W;
    C.height = H;

    // Offscreen silhouette canvas
    const sil = document.createElement("canvas");
    sil.width = W; sil.height = H;
    const sc = sil.getContext("2d")!;
    sc.fillStyle = "#000"; sc.fillRect(0, 0, W, H);

    function feather(bx: number, by: number, tx: number, ty: number, hw: number, op: number) {
      const dx = tx - bx, dy = ty - by, len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) return;
      const nx = -dy / len, ny = dx / len;
      const lw = hw * 1.10, tw = hw * 0.70;
      sc.beginPath();
      sc.moveTo(bx + nx * lw * 0.55, by + ny * lw * 0.55);
      sc.bezierCurveTo(bx + nx * lw * 1.20 + dx * 0.18, by + ny * lw * 1.20 + dy * 0.18, bx + nx * lw * 0.85 + dx * 0.58, by + ny * lw * 0.85 + dy * 0.58, tx + nx * lw * 0.18, ty + ny * lw * 0.18);
      sc.bezierCurveTo(tx + nx * lw * 0.06 + dx * 0.045, ty + ny * lw * 0.06 + dy * 0.045, tx - nx * tw * 0.06 + dx * 0.045, ty - ny * tw * 0.06 + dy * 0.045, tx - nx * tw * 0.18, ty - ny * tw * 0.18);
      sc.bezierCurveTo(bx - nx * tw * 0.78 + dx * 0.58, by - ny * tw * 0.78 + dy * 0.58, bx - nx * tw * 0.88 + dx * 0.18, by - ny * tw * 0.88 + dy * 0.18, bx - nx * tw * 0.42, by - ny * tw * 0.42);
      sc.closePath();
      const g = sc.createLinearGradient(bx, by, tx, ty);
      g.addColorStop(0, `rgba(255,255,255,${op})`);
      g.addColorStop(0.45, `rgba(255,255,255,${op * 0.72})`);
      g.addColorStop(1, `rgba(255,255,255,${op * 0.04})`);
      sc.fillStyle = g;
      sc.fill();
    }

    function fw(bx: number, by: number, a: number, L: number, hw: number, op: number) {
      feather(bx, by, bx - Math.sin(a) * L, by + Math.cos(a) * L, hw, op);
    }

    function drawWing(flip: boolean) {
      sc.save();
      if (flip) { sc.translate(W, 0); sc.scale(-1, 1); }
      const SX = CX - 22, SY = CY + 5;
      const WX = SX - 262, WY = SY - 115;

      sc.beginPath();
      sc.moveTo(SX, SY - 10);
      sc.bezierCurveTo(SX - 70, SY - 70, SX - 165, SY - 112, WX, WY);
      sc.bezierCurveTo(WX - 88, WY + 12, WX - 148, WY + 92, WX - 142, WY + 220);
      sc.bezierCurveTo(WX - 124, WY + 330, WX - 44, WY + 395, SX - 82, SY + 305);
      sc.bezierCurveTo(SX - 52, SY + 268, SX - 18, SY + 195, SX, SY + 68);
      sc.closePath();
      const mg = sc.createRadialGradient(SX - 160, SY + 130, 12, SX - 160, SY + 130, 290);
      mg.addColorStop(0, "rgba(255,255,255,0.96)");
      mg.addColorStop(0.5, "rgba(255,255,255,0.70)");
      mg.addColorStop(0.85, "rgba(255,255,255,0.30)");
      mg.addColorStop(1, "rgba(255,255,255,0.06)");
      sc.fillStyle = mg; sc.fill();

      const primaries: number[][] = [
        [WX - 4, WY + 2, 0.88, 215, 46], [WX + 14, WY + 28, 0.70, 220, 46],
        [WX + 30, WY + 56, 0.52, 226, 45], [WX + 42, WY + 87, 0.34, 228, 45],
        [WX + 50, WY + 118, 0.16, 229, 44], [WX + 53, WY + 149, 0.00, 226, 43],
        [WX + 50, WY + 176, -0.16, 219, 41], [WX + 43, WY + 200, -0.30, 208, 39],
        [WX + 32, WY + 221, -0.42, 193, 37], [WX + 18, WY + 238, -0.52, 174, 35],
      ];
      primaries.forEach(([bx, by, a, L, hw], i) => fw(bx, by, a, L, hw, 0.95 - i * 0.02));

      const secondaries: number[][] = [
        [SX - 40, SY + 182, 0.08, 162, 38], [SX - 82, SY + 214, 0.05, 165, 37],
        [SX - 126, SY + 236, 0.03, 166, 36], [SX - 170, SY + 246, 0.01, 164, 35],
        [SX - 212, SY + 246, -0.02, 160, 34], [SX - 252, SY + 236, -0.06, 153, 32],
        [SX - 289, SY + 216, -0.11, 143, 30], [SX - 320, SY + 187, -0.17, 131, 28],
        [SX - 344, SY + 149, -0.23, 117, 26],
      ];
      secondaries.forEach(([bx, by, a, L, hw], i) => fw(bx, by, a, L, hw, 0.91 - i * 0.02));

      ([[SX - 8, SY + 82, 0.04, 148, 34], [SX - 18, SY + 106, 0.08, 141, 32], [SX - 30, SY + 130, 0.12, 133, 31]] as number[][]).forEach(([bx, by, a, L, hw]) => fw(bx, by, a, L, hw, 0.89));

      ([[SX - 30, SY + 112, 0.04, 104, 29], [SX - 63, SY + 131, 0.02, 106, 28], [SX - 99, SY + 144, 0.01, 105, 27],
        [SX - 137, SY + 151, -.01, 103, 26], [SX - 175, SY + 152, -.04, 99, 25], [SX - 212, SY + 143, -.07, 92, 24],
        [SX - 246, SY + 127, -.11, 84, 22], [SX - 276, SY + 104, -.16, 75, 21], [SX - 300, SY + 75, -.21, 67, 19]] as number[][])
        .forEach(([bx, by, a, L, hw]) => fw(bx, by, a, L, hw, 0.83));

      ([[SX - 26, SY + 58, 0.03, 76, 21], [SX - 55, SY + 70, 0.01, 78, 20], [SX - 87, SY + 77, 0, 78, 19],
        [SX - 121, SY + 80, -.02, 76, 18], [SX - 155, SY + 79, -.04, 72, 18], [SX - 188, SY + 72, -.07, 67, 17],
        [SX - 220, SY + 60, -.10, 61, 16], [SX - 249, SY + 43, -.14, 55, 14], [SX - 274, SY + 21, -.18, 49, 13]] as number[][])
        .forEach(([bx, by, a, L, hw]) => fw(bx, by, a, L, hw, 0.76));

      ([[SX - 22, SY + 14, 0.02, 54, 17], [SX - 48, SY + 20, 0.01, 56, 16], [SX - 76, SY + 23, 0, 56, 15],
        [SX - 107, SY + 23, -.01, 54, 14], [SX - 137, SY + 21, -.03, 51, 14], [SX - 167, SY + 15, -.05, 47, 13],
        [SX - 195, SY + 6, -.08, 42, 12], [SX - 221, SY - 7, -.11, 38, 11], [SX - 243, SY - 21, -.15, 34, 10]] as number[][])
        .forEach(([bx, by, a, L, hw]) => fw(bx, by, a, L, hw, 0.70));

      sc.restore();
    }

    drawWing(false);
    drawWing(true);

    // Body
    sc.beginPath();
    sc.moveTo(CX - 36, CY - 55);
    sc.bezierCurveTo(CX - 60, CY - 8, CX - 60, CY + 60, CX - 30, CY + 106);
    sc.bezierCurveTo(CX - 15, CY + 126, CX + 15, CY + 126, CX + 30, CY + 106);
    sc.bezierCurveTo(CX + 60, CY + 60, CX + 60, CY - 8, CX + 36, CY - 55);
    sc.closePath();
    sc.fillStyle = "rgba(255,255,255,0.97)"; sc.fill();

    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++)
      feather(CX + (c - 2) * 18, CY - 32 + r * 26, CX + (c - 2) * 18 + 1, CY - 32 + r * 26 + 26, 9, 0.82 - r * 0.03);

    // Neck
    sc.beginPath();
    sc.moveTo(CX - 18, CY - 55);
    sc.bezierCurveTo(CX - 24, CY - 90, CX - 20, CY - 118, CX - 12, CY - 138);
    sc.bezierCurveTo(CX - 4, CY - 160, CX + 12, CY - 160, CX + 18, CY - 138);
    sc.bezierCurveTo(CX + 22, CY - 118, CX + 22, CY - 90, CX + 18, CY - 55);
    sc.closePath(); sc.fillStyle = "rgba(255,255,255,0.93)"; sc.fill();

    // Head
    sc.beginPath(); sc.ellipse(CX + 4, CY - 168, 26, 24, 0.08, 0, Math.PI * 2);
    sc.fillStyle = "rgba(255,255,255,0.97)"; sc.fill();
    sc.beginPath(); sc.arc(CX + 12, CY - 170, 5, 0, Math.PI * 2);
    sc.fillStyle = "rgba(255,255,255,1)"; sc.fill();

    // Beak
    sc.beginPath();
    sc.moveTo(CX + 16, CY - 166);
    sc.bezierCurveTo(CX + 30, CY - 172, CX + 55, CY - 162, CX + 57, CY - 152);
    sc.bezierCurveTo(CX + 48, CY - 146, CX + 24, CY - 150, CX + 16, CY - 158);
    sc.closePath(); sc.fillStyle = "rgba(255,255,255,0.88)"; sc.fill();

    // Crest
    ([[-0.54, 66], [-0.33, 76], [-0.11, 82], [0.11, 82], [0.32, 76], [0.52, 67], [0.68, 57]] as number[][])
      .forEach(([a, l]) => feather(CX + 3, CY - 185, CX + 3 + Math.sin(a) * l, CY - 185 - Math.cos(a) * l, 5.5, 0.90));

    // Tail
    for (let i = 0; i < 11; i++) {
      const t = (i - 5) / 5, a = t * 0.76, L = 278 - Math.abs(t) * 25, hw = 21 - Math.abs(t) * 3;
      feather(CX + t * 26, CY + 126, CX + t * 26 + Math.sin(a) * L, CY + 126 + Math.cos(a) * L, hw, 0.92 - Math.abs(t) * 0.09);
    }
    for (let i = 0; i < 7; i++) {
      const t = (i - 3) / 3, a = t * 0.55, L = 172 - Math.abs(t) * 22;
      feather(CX + t * 16, CY + 120, CX + t * 16 + Math.sin(a) * L, CY + 120 + Math.cos(a) * L, 11, 0.76 - Math.abs(t) * 0.08);
    }

    // Talons
    [-26, -8, 8, 26].forEach(dx => {
      feather(CX + dx, CY + 124, CX + dx, CY + 174, 5.5, 0.72);
      feather(CX + dx, CY + 174, CX + dx * 1.4 + 16, CY + 200, 3.5, 0.62);
      feather(CX + dx, CY + 174, CX + dx, CY + 203, 3.5, 0.62);
      feather(CX + dx, CY + 174, CX + dx * 0.75 - 14, CY + 198, 3.5, 0.62);
    });

    // Sample into dot grid
    const GRID = 5;
    const pd = sc.getImageData(0, 0, W, H).data;
    function smp(x: number, y: number) {
      const xi = Math.max(0, Math.min(W - 1, Math.round(x)));
      const yi = Math.max(0, Math.min(H - 1, Math.round(y)));
      return pd[(yi * W + xi) * 4] / 255;
    }
    const dots: number[][] = [];
    for (let gy = GRID * 0.5; gy < H; gy += GRID) {
      for (let gx = GRID * 0.5; gx < W; gx += GRID) {
        let b = 0;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) b += smp(gx + ox, gy + oy);
        b /= 25;
        if (b > 0.022) dots.push([gx, gy, b]);
      }
    }

    function fireColor(gx: number, gy: number, b: number, t: number) {
      const shimmer = 0.028 * Math.sin(gx * 0.047 + t * 2.0) * Math.sin(gy * 0.039 + t * 1.14);
      const s = Math.max(0, Math.min(1, gy / H + shimmer));
      let r = 255, g = 0, bl = 0;
      if (s < 0.10) { g = Math.round(250 - s / 0.10 * 85); bl = Math.round(105 * (1 - s / 0.10)); }
      else if (s < 0.28) { g = Math.round(165 - (s - 0.10) / 0.18 * 68); }
      else if (s < 0.52) { g = Math.round(97 - (s - 0.28) / 0.24 * 44); }
      else if (s < 0.74) { g = Math.round(53 - (s - 0.52) / 0.22 * 38); }
      else { g = Math.round(15 - (s - 0.74) / 0.26 * 13); }
      const f = 0.11 + b * 0.89;
      return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(bl * f)})`;
    }

    // Embers
    const embers = Array.from({ length: 115 }, () => ({
      x: CX + (Math.random() - 0.5) * 420,
      y: CY + 135 + Math.random() * 420,
      vy: 0.30 + Math.random() * 1.15,
      r: 0.16 + Math.random() * 1.85,
      ph: Math.random() * Math.PI * 2,
      hue: 4 + Math.random() * 44,
    }));

    let animId: number;
    function render(ts: number) {
      const t = ts * 0.001, pulse = 1 + 0.07 * Math.sin(t * 1.44);
      ctx!.clearRect(0, 0, W, H);

      const gw = ctx!.createRadialGradient(CX, CY + 10, 0, CX, CY + 10, 430);
      gw.addColorStop(0, `rgba(255,55,5,${0.042 + 0.016 * Math.sin(t * 1.44)})`);
      gw.addColorStop(0.62, "rgba(120,14,2,0.009)");
      gw.addColorStop(1, "rgba(0,0,0,0)");
      ctx!.fillStyle = gw; ctx!.fillRect(0, 0, W, H);

      const mr = GRID * 0.50 * pulse;
      for (const [gx, gy, base] of dots) {
        const wave = 0.026 * Math.sin(gx * 0.046 + t * 1.92) * Math.sin(gy * 0.040 + t * 1.11);
        const b = Math.max(0, Math.min(1, base + wave));
        const dr = b * mr; if (dr < 0.18) continue;
        ctx!.fillStyle = fireColor(gx, gy, b, t);
        ctx!.beginPath(); ctx!.arc(gx, gy, dr, 0, Math.PI * 2); ctx!.fill();
      }

      for (const e of embers) {
        e.y -= e.vy;
        e.x += 0.54 * Math.sin(t * e.vy * 0.84 + e.ph);
        if (e.y < 20) { e.y = CY + 150 + Math.random() * 360; e.x = CX + (Math.random() - 0.5) * 220; }
        const al = Math.min(1, (e.y - 20) / 230) * 0.62;
        ctx!.fillStyle = `hsla(${e.hue},100%,68%,${al})`;
        ctx!.beginPath(); ctx!.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx!.fill();
      }
      animId = requestAnimationFrame(render);
    }
    animId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="phoenix-bg"
    />
  );
}

export default PhoenixBackground;
