// Renders the race progress dial on a canvas
export class DialRenderer {
  constructor(canvas, model) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.model = model;
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width;
    this.h = rect.height;
  }

  draw() {
    const rect = this.canvas.getBoundingClientRect();
    if (
      Math.abs(rect.width - this.w) > 1 ||
      Math.abs(rect.height - this.h) > 1
    ) {
      this.resize();
    }

    const ctx = this.ctx;
    const ringBg =
      getComputedStyle(this.canvas).getPropertyValue("--ring-bg").trim() ||
      "rgba(255,255,255,0.05)";
    const size = Math.min(this.w, this.h);
    const cx = this.w / 2;
    const cy = this.h / 2;
    const innerR = size * 0.22;
    const outerR = size * 0.46;

    ctx.clearRect(0, 0, this.w, this.h);

    const players = this.model.getActivePlayers();
    const numRacers = players.length;
    if (numRacers === 0) return;

    const ringWidth = (outerR - innerR) / numRacers;

    for (let i = 0; i < numRacers; i++) {
      const player = players[i];
      const rInner = innerR + i * ringWidth + 2;
      const rOuter = innerR + (i + 1) * ringWidth - 2;

      // Background ring
      ctx.beginPath();
      ctx.arc(cx, cy, (rInner + rOuter) / 2, 0, Math.PI * 2);
      ctx.lineWidth = rOuter - rInner;
      ctx.strokeStyle = ringBg;
      ctx.stroke();

      // Progress arc
      if (player.pctComplete > 0) {
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + player.pctComplete * Math.PI * 2;

        ctx.beginPath();
        ctx.arc(cx, cy, (rInner + rOuter) / 2, startAngle, endAngle);
        ctx.lineWidth = rOuter - rInner;
        ctx.strokeStyle = player.color;
        ctx.lineCap = "butt";
        ctx.stroke();

        // Speed tail (brighter leading edge)
        const tailAngle = Math.min(player.mph / 50, 0.5) * Math.PI * 0.3;
        if (tailAngle > 0.01) {
          const grad = ctx.createConicGradient(endAngle - tailAngle, cx, cy);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(
            1,
            getComputedStyle(this.canvas)
              .getPropertyValue("--tail-glow")
              .trim() || "rgba(255,255,255,0.3)",
          );

          ctx.beginPath();
          ctx.arc(
            cx,
            cy,
            (rInner + rOuter) / 2,
            endAngle - tailAngle,
            endAngle,
          );
          ctx.lineWidth = rOuter - rInner;
          ctx.strokeStyle = grad;
          ctx.stroke();
        }
      }
    }

    // Timer text in center (only during/after race)
    if (this.model.elapsedRaceMs > 0) {
      const timerText = this.model.formatTime(this.model.elapsedRaceMs);
      const fontSize = Math.round(size * 0.08);
      ctx.font = `${fontSize}px 'Courier New', monospace`;
      ctx.fillStyle =
        getComputedStyle(this.canvas).getPropertyValue("--text").trim() ||
        "rgba(255,255,255,0.8)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(timerText, cx, cy);
    }
  }
}
