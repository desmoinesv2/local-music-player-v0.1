import React, { useEffect, useRef, useState, memo, useMemo } from 'react'; 
import { motion } from 'framer-motion';

interface LyricLine {
  time: number;
  text: string;
  duration?: number;
}

interface LyricsViewProps {
  lyrics: LyricLine[];
  currentTime: number;
  isLoading: boolean;
  fillColor?: string;
  fontSizeScale: number;
}

// --- 归一化歌词时长 ---
function normalizeLyrics(lyrics: LyricLine[]): LyricLine[] {
  const MIN_DURATION = 2.0;
  const LAST_DEFAULT = 5.0;

  return lyrics.map((line, i) => {
    if (i === lyrics.length - 1) {
      return { ...line, duration: line.duration || LAST_DEFAULT };
    }
    const nextStart = lyrics[i + 1].time;
    let duration = nextStart - line.time;
    if (!duration || duration <= 0.1) duration = MIN_DURATION;
    return { ...line, duration };
  });
}

// --- 单行歌词组件 ---
const LyricLineRow = memo(
  ({
    line,
    isActive,
    isPast,
    distance,
    fillColor,
    fontSizeScale,
    currentTime,
  }: {
    line: LyricLine;
    isActive: boolean;
    isPast: boolean;
    distance: number;
    fillColor: string;
    fontSizeScale: number;
    currentTime: number;
  }) => {
    const fontSize = {
      fontSize: `clamp(${36 * fontSizeScale}px, 5vw, ${60 * fontSizeScale}px)`,
      lineHeight: 1.2,
      fontWeight: 800,
      overflowWrap: 'break-word' as const,
    };

    const blur = isActive ? 0 : Math.min(8, distance * 1.5);
    const scale = isActive ? 1.05 : Math.max(0.85, 1 - distance * 0.05);

    if (isActive) {
      const elapsed = Math.max(0, currentTime - line.time);
      const duration = line.duration || 3;
      // Fixed: Speed up fill to finish at 85% of duration to ensure completion before next line
      const fillDuration = Math.max(0.5, duration * 0.85);
      const progress = Math.min(1, elapsed / fillDuration);

      const chars = line.text.split('');
      const totalChars = chars.length;
      const currentStep = progress * totalChars;

      return (
        <motion.div
          style={{
            ...fontSize,
            filter: `blur(${blur}px)`,
            whiteSpace: 'normal',
          }}
          // 行级动画与 inactive 一致
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1, scale }}
          transition={{
            type: 'spring',
            stiffness: 50,
            damping: 30,
            mass: 0.5,
          }}
        >
          {chars.map((char, idx) => {
            const dist = currentStep - idx;
            const percent = Math.max(0, Math.min(1, dist));

            // Viscous effect parameters
            const rise = percent * 10; // Increased rise for visibility
            const glow = percent * 12; // Brighter glow
            const delay = idx * 0.05; // Delay for wave effect

            return (
              <span
                key={idx}
                style={{
                  display: 'inline-block',
                  whiteSpace: 'pre',
                  verticalAlign: 'middle',

                  transform: `translateY(-${rise}px)`,
                  textShadow: `0 0 ${glow}px ${fillColor}`,

                  // Updated transition for "viscous" (sticky/gooey) feel
                  transition: `transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}s, text-shadow 0.5s ease-out ${delay}s`,

                  // Single layer rendering: Right side is transparent (no bottom lyrics)
                  backgroundImage: `linear-gradient(to right, ${fillColor} ${percent * 100}%, transparent ${percent * 100}%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {char}
              </span>
            );
          })}
        </motion.div>
      );
    }

    // Inactive Line
    return (
      <motion.div
        style={{
          ...fontSize,
          filter: `blur(${blur}px)`,
        }}
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1, scale }}
        transition={{
          type: 'spring',
          stiffness: 50,
          damping: 30,
          mass: 0.5,
        }}
      >
        <span
          style={{
            color: isPast ? fillColor : 'white',
            opacity: isPast ? 0.6 : 0.3,
          }}
        >
          {line.text}
        </span>
      </motion.div>
    );
  },
  (prev, next) => {
    if (prev.isActive !== next.isActive) return false;
    if (prev.isActive && next.isActive) {
      return prev.currentTime === next.currentTime;
    }
    return (
      prev.isPast === next.isPast &&
      prev.distance === next.distance &&
      prev.fillColor === next.fillColor &&
      prev.fontSizeScale === next.fontSizeScale
    );
  }
);

// --- 主歌词组件 ---
const LyricsView: React.FC<LyricsViewProps> = ({
  lyrics,
  currentTime,
  isLoading,
  fillColor = '#ffffff',
  fontSizeScale,
}) => {
  const fixedLyrics = useMemo(() => normalizeLyrics(lyrics), [lyrics]);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<HTMLDivElement[]>([]);

  const activeIndex = fixedLyrics.findIndex(
    l => currentTime >= l.time && currentTime < l.time + (l.duration || 3)
  );

  useEffect(() => {
    if (!containerRef.current || activeIndex === -1) return;

    const targetEl = lineRefs.current[activeIndex];
    if (targetEl) {
      targetEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [activeIndex]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <div>LOADING LYRICS</div>
        </div>
      </div>
    );
  }

  if (lyrics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-white/20">
        Waiting for song...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="no-scrollbar"
      style={{
        overflowY: 'auto',
        height: '100%',
        position: 'relative',
        paddingTop: '50vh',
        paddingBottom: '50vh',
        paddingLeft: '4rem',
        paddingRight: '4rem',
        scrollBehavior: 'smooth',
      }}
    >
      {fixedLyrics.map((line, i) => (
        <div
          key={i}
          ref={el => { if (el) lineRefs.current[i] = el; }}
          style={{ padding: '12px 0' }}
        >
          <LyricLineRow
            line={line}
            isActive={i === activeIndex}
            isPast={i < activeIndex}
            distance={Math.abs(i - activeIndex)}
            fillColor={fillColor}
            fontSizeScale={fontSizeScale}
            currentTime={i === activeIndex ? currentTime : 0}
          />
        </div>
      ))}
    </div>
  );
};

export default LyricsView;