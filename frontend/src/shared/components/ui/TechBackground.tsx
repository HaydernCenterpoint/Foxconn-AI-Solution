import React, { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/ui.store';

export const TechBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme, reducedMotion } = useUiStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Handle Resize
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initCircuitPaths();
    };
    window.addEventListener('resize', handleResize);

    // --- Hexagons definition ---
    interface Hexagon {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
      rotation: number;
      rotationSpeed: number;
    }
    const hexagons: Hexagon[] = [];
    const hexCount = 8;
    for (let i = 0; i < hexCount; i++) {
      hexagons.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: 40 + Math.random() * 80,
        speedX: (Math.random() - 0.5) * 0.15,
        speedY: (Math.random() - 0.5) * 0.15,
        opacity: 0.03 + Math.random() * 0.05,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.001,
      });
    }

    // --- Particles (Constellation) ---
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
    }
    const particles: Particle[] = [];
    const particleCount = 45;
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1 + Math.random() * 1.5,
        alpha: 0.1 + Math.random() * 0.25,
      });
    }

    // --- Circuit Paths & Pulses ---
    interface Point {
      x: number;
      y: number;
    }
    interface Path {
      points: Point[];
      pulseProgress: number; // 0 to 1
      pulseSpeed: number;
    }
    let paths: Path[] = [];

    const initCircuitPaths = () => {
      paths = [];
      const pathCount = 12;

      for (let i = 0; i < pathCount; i++) {
        const points: Point[] = [];
        // Choose a starting side or corner
        let currentX = 0;
        let currentY = 0;
        const side = Math.floor(Math.random() * 4); // 0: Top, 1: Right, 2: Bottom, 3: Left

        if (side === 0) {
          currentX = Math.random() * width;
          currentY = 0;
        } else if (side === 1) {
          currentX = width;
          currentY = Math.random() * height;
        } else if (side === 2) {
          currentX = Math.random() * width;
          currentY = height;
        } else {
          currentX = 0;
          currentY = Math.random() * height;
        }

        points.push({ x: currentX, y: currentY });

        // Generate 3 right-angle segments
        const segmentCount = 2 + Math.floor(Math.random() * 3);
        let direction = Math.random() > 0.5 ? 'horizontal' : 'vertical';

        for (let j = 0; j < segmentCount; j++) {
          const length = 50 + Math.random() * 150;
          if (direction === 'horizontal') {
            const nextX = currentX + (Math.random() > 0.5 ? length : -length);
            currentX = Math.max(10, Math.min(width - 10, nextX));
            direction = 'vertical';
          } else {
            const nextY = currentY + (Math.random() > 0.5 ? length : -length);
            currentY = Math.max(10, Math.min(height - 10, nextY));
            direction = 'horizontal';
          }
          points.push({ x: currentX, y: currentY });
        }

        paths.push({
          points,
          pulseProgress: Math.random(),
          pulseSpeed: 0.001 + Math.random() * 0.002,
        });
      }
    };

    initCircuitPaths();

    // Draw Hexagon Helper
    const drawHexagon = (c: CanvasRenderingContext2D, x: number, y: number, size: number) => {
      c.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (Math.PI / 3) * j;
        const hX = x + size * Math.cos(angle);
        const hY = y + size * Math.sin(angle);
        if (j === 0) c.moveTo(hX, hY);
        else c.lineTo(hX, hY);
      }
      c.closePath();
    };

    // Draw Circuit Path Pulse Helper
    const getPointAlongPath = (pathPoints: Point[], progress: number): Point => {
      if (pathPoints.length < 2) return pathPoints[0] || { x: 0, y: 0 };
      const segmentCount = pathPoints.length - 1;
      const progressPerSegment = 1 / segmentCount;
      const segmentIndex = Math.floor(progress / progressPerSegment);
      const segmentProgress = (progress % progressPerSegment) / progressPerSegment;

      const p1 = pathPoints[segmentIndex];
      const p2 = pathPoints[segmentIndex + 1] || p1;

      return {
        x: p1.x + (p2.x - p1.x) * segmentProgress,
        y: p1.y + (p2.y - p1.y) * segmentProgress,
      };
    };

    // Animation Loop
    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Hexagons
      ctx.strokeStyle = '#00f0ff';
      hexagons.forEach((hex) => {
        if (!reducedMotion) {
          hex.x += hex.speedX;
          hex.y += hex.speedY;
          hex.rotation += hex.rotationSpeed;

          // Wrap borders
          if (hex.x - hex.size > width) hex.x = -hex.size;
          else if (hex.x + hex.size < 0) hex.x = width + hex.size;
          if (hex.y - hex.size > height) hex.y = -hex.size;
          else if (hex.y + hex.size < 0) hex.y = height + hex.size;
        }

        ctx.save();
        ctx.translate(hex.x, hex.y);
        ctx.rotate(hex.rotation);
        ctx.lineWidth = 1;
        ctx.globalAlpha = hex.opacity;
        
        // Outer Hex
        drawHexagon(ctx, 0, 0, hex.size);
        ctx.stroke();

        // Inner Hex (smaller & dotted)
        ctx.setLineDash([4, 4]);
        drawHexagon(ctx, 0, 0, hex.size * 0.7);
        ctx.stroke();
        
        ctx.restore();
      });

      // 2. Draw Circuit Paths and traveling pulses
      paths.forEach((path) => {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#005f7f';
        ctx.globalAlpha = 0.15;
        ctx.setLineDash([]);
        
        // Draw the static circuit path line
        ctx.beginPath();
        path.points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        // Draw terminal nodes
        ctx.fillStyle = '#00f0ff';
        const lastPt = path.points[path.points.length - 1];
        if (lastPt) {
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(lastPt.x, lastPt.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(lastPt.x, lastPt.y, 6.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        const firstPt = path.points[0];
        if (firstPt) {
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.arc(firstPt.x, firstPt.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Update & Draw Pulse
        if (!reducedMotion) {
          path.pulseProgress += path.pulseSpeed;
          if (path.pulseProgress > 1) {
            path.pulseProgress = 0;
            path.pulseSpeed = 0.001 + Math.random() * 0.002;
          }
        }

        const pulsePt = getPointAlongPath(path.points, path.pulseProgress);
        
        // Pulse glow
        const radGrd = ctx.createRadialGradient(pulsePt.x, pulsePt.y, 0, pulsePt.x, pulsePt.y, 12);
        radGrd.addColorStop(0, 'rgba(0, 240, 255, 0.6)');
        radGrd.addColorStop(0.3, 'rgba(0, 240, 255, 0.2)');
        radGrd.addColorStop(1, 'rgba(0, 240, 255, 0)');
        
        ctx.fillStyle = radGrd;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(pulsePt.x, pulsePt.y, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(pulsePt.x, pulsePt.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. Draw Particles (Constellations)
      particles.forEach((p) => {
        if (!reducedMotion) {
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < 0 || p.x > width) p.vx = -p.vx;
          if (p.y < 0 || p.y > height) p.vy = -p.vy;
        }

        ctx.fillStyle = '#00f0ff';
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Connect particle lines
      ctx.strokeStyle = '#2F7BFF';
      for (let i = 0; i < particleCount; i++) {
        for (let j = i + 1; j < particleCount; j++) {
          const p1 = particles[i];
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 110) {
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = (1 - dist / 110) * 0.12;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-45 select-none"
      style={{
        mixBlendMode: 'screen',
        background: 'transparent',
      }}
    />
  );
};

export default TechBackground;
