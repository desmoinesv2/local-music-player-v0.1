import React, { useRef, useEffect, memo } from 'react';

interface SpectrumProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  color: string; // Hex or RGB color for custom mode
  rainbowMode: boolean;
  blur: number; // For Spectrum Bars
  effectsBlur: number; // For Rain, Fireworks, Bokeh
  brightness: number;
  enableRain: boolean;
  enableFireworks: boolean;
  enableBokeh: boolean;
}

interface Sparkle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
}

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  life: number;
  maxLife: number;
}

interface FireworkRocket {
  x: number;
  y: number;
  targetY: number;
  vy: number;
  color: string;
  exploded: boolean;
}

const Spectrum: React.FC<SpectrumProps> = memo(({ 
  analyser, 
  isPlaying, 
  color,
  rainbowMode,
  blur,
  effectsBlur,
  brightness,
  enableRain,
  enableFireworks,
  enableBokeh
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const peaksRef = useRef<number[]>([]);

  // Particle Refs
  const sparklesRef = useRef<Sparkle[]>([]);
  const rainRef = useRef<RainDrop[]>([]);
  const rocketsRef = useRef<FireworkRocket[]>([]);
  const particlesRef = useRef<FireworkParticle[]>([]);

  // Initialize Rain Pool
  useEffect(() => {
    if (rainRef.current.length === 0) {
        for(let i=0; i<150; i++) {
            rainRef.current.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                length: Math.random() * 20 + 10,
                speed: Math.random() * 5 + 5,
                opacity: Math.random() * 0.5 + 0.1
            });
        }
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); 
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const barsToRender = 64; 
    const step = Math.floor(bufferLength / 2.0 / barsToRender);

    if (peaksRef.current.length !== barsToRender) {
      peaksRef.current = new Array(barsToRender).fill(0);
    }

    // Helper to extract HSL
    const getBaseColor = (inputColor: string) => {
       const div = document.createElement('div');
       div.style.color = inputColor;
       document.body.appendChild(div);
       const computed = window.getComputedStyle(div).color;
       document.body.removeChild(div);
       
       const match = computed.match(/\d+/g);
       if (!match) return { h: 0, s: 0, l: 50, str: inputColor };
       
       const r = parseInt(match[0]) / 255;
       const g = parseInt(match[1]) / 255;
       const b = parseInt(match[2]) / 255;
       
       const max = Math.max(r, g, b), min = Math.min(r, g, b);
       let h = 0, s = 0, l = (max + min) / 2;
       
       if (max !== min) {
         const d = max - min;
         s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
         switch (max) {
           case r: h = (g - b) / d + (g < b ? 6 : 0); break;
           case g: h = (b - r) / d + 2; break;
           case b: h = (r - g) / d + 4; break;
         }
         h /= 6;
       }
       
       return { h: h * 360, s: s * 100, l: l * 100, str: inputColor };
    };

    const customBase = !rainbowMode ? getBaseColor(color) : { h: 0, s: 0, l: 0, str: color };

    const draw = () => {
      if (!canvas) return;
      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.clearRect(0, 0, width, height);

      if (isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      }

      // Energy extraction for effects
      let bassEnergy = 0;
      let midEnergy = 0;
      let highEnergy = 0;
      if (isPlaying) {
        const bassRange = 8;
        const midRangeStart = 20;
        const midRangeEnd = 80;
        const highRangeStart = 80;
        const highRangeEnd = 150;
        for (let i = 0; i < bassRange; i++) bassEnergy += dataArray[i];
        bassEnergy /= bassRange;
        for (let i = midRangeStart; i < midRangeEnd; i++) midEnergy += dataArray[i];
        midEnergy /= (midRangeEnd - midRangeStart);
        for (let i = highRangeStart; i < highRangeEnd; i++) highEnergy += dataArray[i];
        highEnergy /= (highRangeEnd - highRangeStart);
      }
      const normBass = bassEnergy / 255;
      const normMid = midEnergy / 255;
      const normHigh = highEnergy / 255;

      // Apply Global Brightness (Opacity)
      ctx.globalAlpha = Math.min(1, Math.max(0, brightness));
      
      // Use Additive Blending for Neon Glow Effect
      ctx.globalCompositeOperation = 'lighter';

      // --- 1. Rain Effect (Foreground) ---
      if (enableRain) {
          ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
          ctx.lineWidth = 1;
          ctx.shadowBlur = effectsBlur * 0.5; // Apply partial blur to rain
          ctx.shadowColor = 'white';
          
          ctx.beginPath();
          for(let i=0; i < rainRef.current.length; i++) {
              const drop = rainRef.current[i];
              drop.y += drop.speed + (normBass * 15);
              if (drop.y > height) {
                  drop.y = -drop.length;
                  drop.x = Math.random() * width;
              }
              ctx.moveTo(drop.x, drop.y);
              ctx.lineTo(drop.x, drop.y + drop.length);
          }
          ctx.stroke();
          ctx.shadowBlur = 0; // Reset
      }

      // --- 2. Fireworks Effect ---
      if (enableFireworks) {
          // Launch rockets
          if (isPlaying && Math.random() < 0.01 + (normBass * 0.08)) {
             rocketsRef.current.push({
                 x: Math.random() * width,
                 y: height,
                 targetY: height * 0.2 + Math.random() * height * 0.4,
                 vy: - (Math.random() * 6 + 12),
                 color: `hsl(${Math.random() * 360}, 100%, 70%)`,
                 exploded: false
             });
          }

          // Update Rockets
          for (let i = rocketsRef.current.length - 1; i >= 0; i--) {
             const rocket = rocketsRef.current[i];
             rocket.y += rocket.vy;
             rocket.vy += 0.2; 
             
             ctx.shadowBlur = effectsBlur;
             ctx.shadowColor = rocket.color;
             ctx.fillStyle = rocket.color;
             ctx.beginPath();
             ctx.arc(rocket.x, rocket.y, 3, 0, Math.PI*2);
             ctx.fill();

             if (rocket.vy >= -2 || rocket.y <= rocket.targetY) {
                 const particleCount = 40;
                 for(let j=0; j<particleCount; j++) {
                     const angle = Math.random() * Math.PI * 2;
                     const speed = Math.random() * 6 + 2;
                     particlesRef.current.push({
                         x: rocket.x,
                         y: rocket.y,
                         vx: Math.cos(angle) * speed,
                         vy: Math.sin(angle) * speed,
                         alpha: 1,
                         color: rocket.color,
                         life: 100,
                         maxLife: 100
                     });
                 }
                 rocketsRef.current.splice(i, 1);
             }
          }

          // Update Particles
          for (let i = particlesRef.current.length - 1; i >= 0; i--) {
              const p = particlesRef.current[i];
              p.x += p.vx;
              p.y += p.vy;
              p.vy += 0.15; 
              p.alpha -= 0.015; 
              
              if (p.alpha <= 0) {
                  particlesRef.current.splice(i, 1);
                  continue;
              }

              ctx.shadowBlur = effectsBlur * 0.8;
              ctx.shadowColor = p.color;
              ctx.globalAlpha = p.alpha * brightness; // Mix global brightness
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2);
              ctx.fill();
              ctx.globalAlpha = brightness; // Reset
          }
          ctx.shadowBlur = 0;
      }

      // --- 3. Bokeh / Sparkles ---
      if (enableBokeh) {
        // Spawn
        if (isPlaying && Math.random() < normMid * 0.4) {
           sparklesRef.current.push({
              x: Math.random() * width,
              y: Math.random() * height,
              size: Math.random() * 50 + 20,
              alpha: 0,
              life: 0,
              maxLife: 90 + Math.random() * 60 
           });
        }
        // Draw
        for (let i = sparklesRef.current.length - 1; i >= 0; i--) {
           const p = sparklesRef.current[i];
           p.life++;
           if (p.life < 30) {
               p.alpha = (p.life / 30) * (0.3 + normHigh * 0.4);
           } else if (p.life > p.maxLife - 30) {
               p.alpha = ((p.maxLife - p.life) / 30) * (0.3 + normHigh * 0.4);
           }
           if (p.life >= p.maxLife) {
               sparklesRef.current.splice(i, 1);
               continue;
           }
           
           // Apply custom color or white based on rainbow mode
           const bokehColor = rainbowMode 
               ? `hsl(${(p.x / width) * 360}, 100%, 70%)` 
               : color;

           ctx.shadowBlur = effectsBlur; // Bokeh reacts to effectsBlur setting
           ctx.shadowColor = bokehColor;
           ctx.fillStyle = bokehColor;
           ctx.globalAlpha = p.alpha * brightness;
           ctx.beginPath();
           ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2); // Slightly smaller for sharpness unless blurred
           ctx.fill();
           ctx.globalAlpha = brightness;
        }
        ctx.shadowBlur = 0;
      }

      // --- 4. Spectrum Bars ---
      const barWidth = (width / barsToRender) * 0.8;
      const spacing = (width / barsToRender) * 0.2;
      const startX = spacing / 2;
      const bottomY = height;

      for (let i = 0; i < barsToRender; i++) {
        const dataIndex = Math.floor(i * step);
        let value = isPlaying ? dataArray[dataIndex] : 0;
        
        const percent = value / 255;
        let boost = 1 + (i < 10 ? 0.3 : 0) + (i > 50 ? 0.5 : 0);
        let barHeight = (Math.pow(percent, 1.4) * height * 0.45) * boost;
        barHeight = Math.max(2, barHeight); 

        const x = startX + i * (barWidth + spacing);
        const y = bottomY - barHeight;

        let barColor, glowColor, reflectionColor, peakColor;

        if (rainbowMode) {
            const hue = (i / barsToRender) * 320; 
            barColor = `hsl(${hue}, 100%, 60%)`;
            glowColor = `hsl(${hue}, 100%, 50%)`;
            reflectionColor = `hsla(${hue}, 100%, 60%, 0.2)`;
            peakColor = `hsla(${hue}, 100%, 80%, 0.8)`;
        } else {
            const hueShift = (i / barsToRender) * 20 - 10; 
            const h = (customBase.h + hueShift + 360) % 360;
            barColor = `hsl(${h}, ${customBase.s}%, ${customBase.l}%)`;
            glowColor = `hsl(${h}, ${customBase.s}%, ${Math.min(100, customBase.l + 10)}%)`;
            reflectionColor = `hsla(${h}, ${customBase.s}%, ${customBase.l}%, 0.2)`;
            peakColor = `hsla(${h}, ${customBase.s}%, 90%, 0.8)`;
        }

        ctx.shadowBlur = blur;
        ctx.shadowColor = glowColor;
        ctx.fillStyle = barColor;
        
        ctx.beginPath();
        ctx.rect(x, y, barWidth, barHeight);
        ctx.fill();
        
        ctx.shadowBlur = blur * 2;
        ctx.fillStyle = reflectionColor;
        ctx.beginPath();
        ctx.rect(x, bottomY, barWidth, barHeight * 0.4);
        ctx.fill();

        ctx.shadowBlur = 0; 

        if (barHeight > peaksRef.current[i]) {
            peaksRef.current[i] = barHeight;
        } else {
            peaksRef.current[i] *= 0.95;
            peaksRef.current[i] -= 0.5;
        }
        
        if (peaksRef.current[i] > 5) {
            const peakY = bottomY - peaksRef.current[i] - 8;
            ctx.fillStyle = peakColor;
            ctx.shadowBlur = blur * 0.6;
            ctx.shadowColor = glowColor;
            ctx.beginPath();
            ctx.rect(x, peakY, barWidth, 4);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
      }
      
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser, isPlaying, color, rainbowMode, blur, effectsBlur, brightness, enableRain, enableFireworks, enableBokeh]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-10" />;
});

export default Spectrum;