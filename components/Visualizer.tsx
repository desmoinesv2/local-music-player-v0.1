import React, { useRef, useEffect, memo } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  color: string; // Hex color
}

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

const Visualizer: React.FC<VisualizerProps> = memo(({ 
  analyser, 
  isPlaying, 
  color
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  // Refs for background blobs
  const blobsRef = useRef<Blob[]>([]);

  // Initialize blobs (Background layer)
  useEffect(() => {
    if (blobsRef.current.length === 0) {
      for (let i = 0; i < 5; i++) {
        blobsRef.current.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          size: Math.random() * 400 + 300,
          phase: Math.random() * Math.PI * 2,
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
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!canvas) return;
      const width = window.innerWidth;
      const height = window.innerHeight;

      ctx.clearRect(0, 0, width, height);

      // Parse color
      let r = 255, g = 255, b = 255;
      if (color.startsWith('#') && color.length === 7) {
        r = parseInt(color.slice(1, 3), 16);
        g = parseInt(color.slice(3, 5), 16);
        b = parseInt(color.slice(5, 7), 16);
      }

      // --- Audio Feature Extraction ---
      if (isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      }

      let bassEnergy = 0;

      if (isPlaying) {
        const bassRange = 8;
        for (let i = 0; i < bassRange; i++) bassEnergy += dataArray[i];
        bassEnergy /= bassRange;
      }

      const normBass = bassEnergy / 255;

      // --- Background Blobs (Liquid Atmosphere) ---
      ctx.globalCompositeOperation = 'source-over'; 
      
      blobsRef.current.forEach(blob => {
        if (isPlaying) {
            blob.phase += 0.005 + (normBass * 0.01); 
            blob.x += Math.sin(blob.phase) * 1.5 + blob.vx;
            blob.y += Math.cos(blob.phase) * 1.5 + blob.vy;
            
            if (blob.x < -blob.size) blob.x = width + blob.size;
            if (blob.x > width + blob.size) blob.x = -blob.size;
            if (blob.y < -blob.size) blob.y = height + blob.size;
            if (blob.y > height + blob.size) blob.y = -blob.size;
        }

        const pulse = 1 + (normBass * 0.3);
        const currentSize = blob.size * pulse;
        const opacity = 0.25 + (normBass * 0.15);

        const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, currentSize);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${opacity * 0.3})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, currentSize, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser, isPlaying, color]);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
});

export default Visualizer;