import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Music, Upload, FileText, Image as ImageIcon, Sparkles, Clock, Palette, Check, Edit2, PaintBucket, Settings2, Sliders } from 'lucide-react';
import { LyricLine, SongMetadata, PlaybackState } from './types';
import LyricsView from './components/LyricsView';
import Visualizer from './components/Visualizer';
import Spectrum from './components/Spectrum';
import { generateLyrics, getSongInsight } from './services/geminiService';

// --- Utils ---
const parseLrc = (lrcString: string): LyricLine[] => {
  const lines = lrcString.split('\n');
  const tempLyrics: { time: number; text: string }[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  lines.forEach(line => {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = parseFloat(`0.${match[3]}`);
      const time = minutes * 60 + seconds + milliseconds;
      const text = match[4].trim();
      if (text) {
        tempLyrics.push({ time, text });
      }
    }
  });

  const finalLyrics: LyricLine[] = [];
  
  for (let i = 0; i < tempLyrics.length; i++) {
    const line = tempLyrics[i];
    const nextLine = tempLyrics[i + 1];
    
    // Calculate raw duration until next line
    const timeDiff = nextLine ? nextLine.time - line.time : 5.0;

    // Logic: If the gap is large (> 10.0s), assume instrumental break.
    // Insert transition line.
    if (timeDiff > 10.0) {
      finalLyrics.push({
        time: line.time,
        text: line.text,
        duration: timeDiff - 2.0 // Leave 2s for dots
      });
      finalLyrics.push({
        time: line.time + (timeDiff - 2.0),
        text: "•••",
        duration: 2.0
      });
    } else {
      finalLyrics.push({
        time: line.time,
        text: line.text,
        duration: timeDiff
      });
    }
  }

  return finalLyrics;
};

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const extractColorFromImage = (imageUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('#4ade80');
        return;
      }
      canvas.width = 1;
      canvas.height = 1;
      ctx.drawImage(img, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      resolve(`rgb(${r},${g},${b})`);
    };
    img.onerror = () => resolve('#4ade80');
  });
};

// --- Custom Components ---
const GlassButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode, active?: boolean, label?: string }> = ({ 
  icon, className = "", active, label, ...props 
}) => (
  <button 
    className={`
      group relative flex items-center justify-center w-12 h-12 rounded-full 
      backdrop-blur-md transition-all duration-500 shrink-0
      ${active ? 'bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-white/10 hover:bg-white/20'}
      hover:shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:scale-105 active:scale-95
      ${className}
    `}
    {...props}
  >
    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <span className="relative z-10 text-white/90 group-hover:text-white transition-colors">
      {icon}
    </span>
  </button>
);

const ProgressBar: React.FC<{ currentTime: number; duration: number; onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void; color: string }> = ({
  currentTime, duration, onSeek, color
}) => {
  const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  return (
    <div className="group relative w-full h-6 flex items-center cursor-pointer">
       {/* Invisible range input for interaction */}
       <input 
         type="range" 
         min={0} 
         max={duration || 100} 
         value={currentTime} 
         onChange={onSeek}
         className="absolute inset-0 z-20 w-full opacity-0 cursor-pointer"
       />

       {/* Track Background (Unplayed - Theme Color) */}
       <div 
         className="absolute inset-x-0 h-1.5 rounded-full overflow-hidden"
         style={{ backgroundColor: `${color}40` }} 
       >
          {/* Played Part (White) */}
          <div 
            className="h-full bg-white transition-[width] duration-100 ease-linear"
            style={{ width: `${percent}%` }}
          />
       </div>

       {/* Thumb (Glowing Dot) */}
       <div 
         className="absolute h-4 w-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] z-10 pointer-events-none transition-[left] duration-100 ease-linear flex items-center justify-center"
         style={{ left: `clamp(0%, ${percent}%, calc(100% - 16px))` }}
       >
         <div className="absolute inset-0 rounded-full bg-white animate-ping opacity-20" />
       </div>
    </div>
  );
};

const App: React.FC = () => {
  // --- State ---
  const [song, setSong] = useState<SongMetadata | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.STOPPED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dominantColor, setDominantColor] = useState<string>('#4ade80');
  const [customColor, setCustomColor] = useState<string>('#ffffff'); // User selected highlight color (lyrics)
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [insight, setInsight] = useState<string>('');
  const [lyricsOffset, setLyricsOffset] = useState<number>(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isControlsHovered, setIsControlsHovered] = useState(false);

  // Appearance Settings
  const [fontSizeScale, setFontSizeScale] = useState(1);
  const [spectrumRainbow, setSpectrumRainbow] = useState(true);
  const [spectrumBlur, setSpectrumBlur] = useState(15); // Blur for Bars
  const [effectsBlur, setEffectsBlur] = useState(10); // Blur for Effects (Rain, etc)
  const [spectrumBrightness, setSpectrumBrightness] = useState(1.0);
  
  // Visual Effect States
  const [showRain, setShowRain] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [showBokeh, setShowBokeh] = useState(true);
  
  // UI Toggles
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // --- Refs ---
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lrcInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // --- Audio Context Setup ---
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current && audioRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const ana = ctx.createAnalyser();
      ana.fftSize = 2048;
      ana.smoothingTimeConstant = 0.8;
      
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(ana);
      ana.connect(ctx.destination);
      
      audioContextRef.current = ctx;
      setAnalyser(ana);
    } else if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  // --- Animation Loop ---
  const animate = useCallback(() => {
    if (audioRef.current && playbackState === PlaybackState.PLAYING) {
      const time = audioRef.current.currentTime;
      if (Math.abs(time - lastTimeRef.current) > 0.005) {
         setCurrentTime(time);
         lastTimeRef.current = time;
      } else if (time === 0) {
         setCurrentTime(0);
      }
      requestRef.current = requestAnimationFrame(animate);
    }
  }, [playbackState]);

  useEffect(() => {
    if (playbackState === PlaybackState.PLAYING) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [playbackState, animate]);


  // --- Handlers ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      
      let artist = 'Unknown Artist';
      let title = file.name.replace(/\.[^/.]+$/, "");
      const separator = title.includes(' - ') ? ' - ' : '-';
      if (title.includes(separator)) {
        const parts = title.split(separator);
        artist = parts[0].trim();
        title = parts[1].trim();
      }

      setSong({
        title,
        artist,
        fileUrl: objectUrl,
        fileName: file.name,
        duration: 0
      });
      
      setLyrics([]); 
      setInsight('');
      setPlaybackState(PlaybackState.PLAYING);
      
      // Randomize theme color initially
      const hues = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
      setDominantColor(hues[Math.floor(Math.random() * hues.length)]);

      if (audioRef.current) {
        audioRef.current.src = objectUrl;
        audioRef.current.play().then(() => {
             initAudioContext();
             setPlaybackState(PlaybackState.PLAYING);
        }).catch(err => console.error("Play error:", err));
      }
    }
  };

  const handleLrcFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setLyrics(parseLrc(text));
      };
      reader.readAsText(file);
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && song) {
       const coverUrl = URL.createObjectURL(file);
       setSong({ ...song, coverUrl });
       
       try {
         const extractedColor = await extractColorFromImage(coverUrl);
         setDominantColor(extractedColor);
       } catch (error) {
         console.warn("Could not extract color", error);
       }
    }
  };

  const handleGenerateLyrics = async () => {
    if (!song) return;
    setGeminiLoading(true);
    getSongInsight(song.artist, song.title).then(setInsight);
    const lrcText = await generateLyrics(song.artist, song.title);
    setLyrics(parseLrc(lrcText));
    setGeminiLoading(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playbackState === PlaybackState.PLAYING) {
      audioRef.current.pause();
      setPlaybackState(PlaybackState.PAUSED);
    } else {
      audioRef.current.play();
      initAudioContext();
      setPlaybackState(PlaybackState.PLAYING);
    }
  };

  const handleNativeTimeUpdate = () => {
    if (audioRef.current) {
      if (!isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const adjustOffset = (amount: number) => {
    setLyricsOffset(prev => prev + amount);
  };

  const updateMetadata = (field: 'title' | 'artist', value: string) => {
    if (song) {
      setSong({ ...song, [field]: value });
    }
  };

  const colorPalette = [ 
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#000000'
  ];

  const handleToggle = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
     // Close others
     setShowColorPicker(false);
     setShowBgColorPicker(false);
     setShowSettings(false);
     setter(prev => !prev);
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden text-white bg-black font-sans selection:bg-white/30">
        {/* --- Background System --- */}
        <div 
          className="absolute inset-0 z-0 transition-colors duration-[3000ms] opacity-60"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${dominantColor} 0px, transparent 50%),
              radial-gradient(at 100% 0%, ${dominantColor}40 0px, transparent 50%),
              radial-gradient(at 100% 100%, ${dominantColor} 0px, transparent 50%),
              radial-gradient(at 0% 100%, ${dominantColor}40 0px, transparent 50%)
            `
          }}
        />

        {/* Visualizer Layer (Background Blobs) */}
        <Visualizer 
          analyser={analyser} 
          isPlaying={playbackState === PlaybackState.PLAYING} 
          color={dominantColor}
        />

        {/* Glass Overlay */}
        <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-[60px] saturate-150" />

        {/* Spectrum Layer (Foreground Effects + Bars) */}
        <Spectrum 
           analyser={analyser} 
           isPlaying={playbackState === PlaybackState.PLAYING} 
           color={dominantColor}
           rainbowMode={spectrumRainbow}
           blur={spectrumBlur}
           effectsBlur={effectsBlur}
           brightness={spectrumBrightness}
           enableRain={showRain}
           enableFireworks={showFireworks}
           enableBokeh={showBokeh}
        />

        {/* --- Foreground Content --- */}
        <div className="relative z-20 flex h-full flex-col md:flex-row p-6 md:p-8 gap-6 md:gap-12">
            
            {/* Left Panel */}
            <div className="flex flex-col flex-1 md:flex-[0_0_40%] lg:flex-[0_0_35%] max-w-xl h-full min-h-0 justify-between animate-in fade-in slide-in-from-left duration-1000">
                <div className="flex-1 min-h-0 relative flex flex-col justify-end md:justify-center">
                    {/* Album Art Container - No borders/bg */}
                    <div className="relative aspect-square max-h-full max-w-full w-auto mx-auto md:mx-0 rounded-2xl overflow-hidden group">
                        {song?.coverUrl ? (
                            <img src={song.coverUrl} alt="Album Art" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center">
                                <Music size={80} className="text-white/20 mb-4 drop-shadow-glow" />
                                <p className="text-white/30 font-medium">Aura Music</p>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm z-20">
                             <GlassButton icon={<ImageIcon size={24} />} onClick={() => coverInputRef.current?.click()} title="Change Cover" />
                        </div>
                    </div>
                </div>

                <div className="space-y-2 text-center group/info my-4 shrink-0 flex flex-col items-center z-10">
                    {song ? (
                      <>
                        <input value={song.title} onChange={(e) => updateMetadata('title', e.target.value)} className="w-full bg-transparent text-3xl md:text-5xl font-bold tracking-tight text-white drop-shadow-lg outline-none border-b border-transparent focus:border-white/20 transition-colors text-center placeholder-white/20" placeholder="Song Title" />
                        <input value={song.artist} onChange={(e) => updateMetadata('artist', e.target.value)} className="w-full bg-transparent text-xl md:text-3xl font-medium text-white/60 outline-none border-b border-transparent focus:border-white/20 transition-colors text-center placeholder-white/20" placeholder="Artist Name" />
                        <div className="h-4 opacity-0 group-hover/info:opacity-100 text-xs text-white/20 transition-opacity text-center flex items-center gap-1 justify-center"><Edit2 size={10} /> Click text to edit</div>
                      </>
                    ) : (
                      <>
                        <h1 className="text-3xl md:text-5xl font-bold truncate tracking-tight text-white drop-shadow-lg">Welcome</h1>
                        <h2 className="text-xl md:text-3xl font-medium text-white/60 truncate">Select a song to start</h2>
                      </>
                    )}
                    {insight && (
                      <div className="inline-flex items-start gap-3 mt-4 text-left text-sm text-white/90 bg-white/10 p-4 rounded-xl backdrop-blur-md shadow-lg max-h-32 overflow-y-auto no-scrollbar">
                        <Sparkles size={18} className="mt-0.5 text-sky-300 shrink-0" />
                        <p className="leading-relaxed font-light tracking-wide">{insight}</p>
                      </div>
                    )}
                </div>

                {/* Controls Container - No borders/bg */}
                <div 
                  className="p-6 space-y-6 shrink-0 w-full"
                  onMouseEnter={() => setIsControlsHovered(true)}
                  onMouseLeave={() => setIsControlsHovered(false)}
                >
                  <div className="space-y-2">
                     <ProgressBar currentTime={currentTime} duration={duration} onSeek={handleSeek} color={dominantColor} />
                     <div className="flex justify-between text-xs font-medium text-white/40 font-mono tracking-wider">
                         <span>{formatTime(currentTime)}</span>
                         <span>{song ? formatTime(duration) : "--:--"}</span>
                      </div>
                  </div>

                  <div className="flex items-center justify-center h-14 relative w-full">
                      <div className={`flex gap-2 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden ${isControlsHovered ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0'}`}>
                         <GlassButton icon={<Upload size={18} />} onClick={() => fileInputRef.current?.click()} title="Load Song" />
                         <GlassButton icon={<FileText size={18} />} onClick={() => lrcInputRef.current?.click()} active={lyrics.length > 0} title="Upload Lyrics (.lrc)" disabled={!song} />
                         <GlassButton icon={<ImageIcon size={18} />} onClick={() => coverInputRef.current?.click()} title="Upload Cover Art" disabled={!song} />
                      </div>

                      <div className="flex items-center gap-4 md:gap-6 shrink-0 z-10 mx-4 transition-all duration-500">
                           <button className="w-12 h-12 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition active:scale-95"><SkipBack size={24} fill="currentColor" /></button>
                           <button onClick={togglePlay} className="w-16 h-16 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition duration-300 active:scale-95 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                             {playbackState === PlaybackState.PLAYING ? <Pause size={40} fill="currentColor" /> : <Play size={40} fill="currentColor" className="ml-1" />}
                           </button>
                           <button className="w-12 h-12 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition active:scale-95"><SkipForward size={24} fill="currentColor" /></button>
                      </div>
                      
                      <div className={`flex gap-2 justify-end transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] overflow-hidden ${isControlsHovered ? 'max-w-[100px] opacity-100' : 'max-w-0 opacity-0'}`}>
                        <GlassButton icon={<Sparkles size={18} />} onClick={handleGenerateLyrics} active={geminiLoading} title="AI Generate Lyrics" disabled={!song || geminiLoading} className={geminiLoading ? 'animate-pulse' : ''} />
                      </div>
                  </div>
                </div>
            </div>

            {/* Right Panel: Lyrics */}
            <div className="flex-1 h-full min-h-0 flex flex-col relative">
               {/* Retain backdrop-blur for Lyrics, but remove distinct borders/shadows to feel open */}
               <div className="flex-1 rounded-[2.5rem] backdrop-blur-md overflow-hidden relative group w-full">
                   
                   {/* Lyric Tools Overlay */}
                   <div className="absolute top-6 right-6 z-30 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-x-4 group-hover:translate-x-0">
                      
                      <div className="flex flex-col items-center bg-black/40 backdrop-blur-md rounded-full p-1">
                          <button onClick={() => adjustOffset(-0.5)} className="p-2 text-white/50 hover:text-white transition hover:bg-white/10 rounded-full"><Clock size={16} /> -0.5s</button>
                          <div className="h-px w-full bg-white/10 my-1" />
                          <button onClick={() => adjustOffset(0.5)} className="p-2 text-white/50 hover:text-white transition hover:bg-white/10 rounded-full"><Clock size={16} /> +0.5s</button>
                          <div className="text-[10px] text-white/40 py-1 font-mono">{lyricsOffset > 0 ? '+' : ''}{lyricsOffset}s</div>
                      </div>

                      <div className="relative">
                        <button onClick={() => handleToggle(setShowColorPicker)} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white/50 hover:text-white transition hover:bg-white/10" title="Lyrics Color">
                          <Palette size={20} />
                        </button>
                        {showColorPicker && (
                          <div className="absolute top-0 right-14 bg-black/80 backdrop-blur-xl p-3 rounded-2xl grid grid-cols-5 gap-2 w-56 shadow-2xl z-50">
                             {colorPalette.map((c, i) => (
                               <button key={i} className="w-8 h-8 rounded-full hover:scale-110 transition shadow-lg relative" style={{ backgroundColor: c }} onClick={() => { setCustomColor(c); setShowColorPicker(false); }}>
                                 {customColor === c && <Check size={14} className="text-black/50 mx-auto" />}
                               </button>
                             ))}
                          </div>
                        )}
                      </div>

                      <div className="relative">
                        <button onClick={() => handleToggle(setShowBgColorPicker)} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white/50 hover:text-white transition hover:bg-white/10" title="Background Color">
                          <PaintBucket size={20} />
                        </button>
                        {showBgColorPicker && (
                          <div className="absolute top-0 right-14 bg-black/80 backdrop-blur-xl p-3 rounded-2xl grid grid-cols-5 gap-2 w-56 shadow-2xl z-50">
                             {colorPalette.map((c, i) => (
                               <button key={i} className="w-8 h-8 rounded-full hover:scale-110 transition shadow-lg relative" style={{ backgroundColor: c }} onClick={() => { setDominantColor(c); setShowBgColorPicker(false); }}>
                                 {dominantColor === c && <Check size={14} className="text-black/50 mx-auto" />}
                               </button>
                             ))}
                          </div>
                        )}
                      </div>

                      <div className="relative">
                        <button onClick={() => handleToggle(setShowSettings)} className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white/50 hover:text-white transition hover:bg-white/10" title="Visual Settings">
                          <Settings2 size={20} />
                        </button>
                        {showSettings && (
                          <div className="absolute top-0 right-14 bg-black/80 backdrop-blur-xl p-4 rounded-2xl w-64 shadow-2xl z-50 text-left space-y-4 border border-white/10 max-h-[400px] overflow-y-auto no-scrollbar">
                             <div className="space-y-2">
                                <div className="flex justify-between text-xs text-white/60 font-medium"><span>Lyrics Size</span><span>{Math.round(fontSizeScale * 100)}%</span></div>
                                <input type="range" min="0.5" max="1.5" step="0.1" value={fontSizeScale} onChange={(e) => setFontSizeScale(parseFloat(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-white cursor-pointer" />
                             </div>
                             
                             <div className="h-px bg-white/10" />
                             
                             <div className="space-y-3">
                                <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Spectrum</p>
                                
                                <label className="flex items-center justify-between text-sm text-white/70 cursor-pointer">
                                   <span>Rainbow Mode</span>
                                   <input type="checkbox" checked={spectrumRainbow} onChange={(e) => setSpectrumRainbow(e.target.checked)} className="accent-white scale-110" />
                                </label>

                                <div className="space-y-1">
                                   <div className="flex justify-between text-xs text-white/60"><span>Bar Blur</span><span>{spectrumBlur}px</span></div>
                                   <input type="range" min="0" max="40" step="1" value={spectrumBlur} onChange={(e) => setSpectrumBlur(parseInt(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-white cursor-pointer" />
                                </div>

                                <div className="space-y-1">
                                   <div className="flex justify-between text-xs text-white/60"><span>Brightness</span><span>{Math.round(spectrumBrightness * 100)}%</span></div>
                                   <input type="range" min="0.1" max="1.5" step="0.1" value={spectrumBrightness} onChange={(e) => setSpectrumBrightness(parseFloat(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-white cursor-pointer" />
                                </div>
                             </div>

                             <div className="h-px bg-white/10" />

                             <div className="space-y-3">
                                <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Effects</p>
                                
                                <div className="space-y-1">
                                   <div className="flex justify-between text-xs text-white/60"><span>Effects Blur</span><span>{effectsBlur}px</span></div>
                                   <input type="range" min="0" max="40" step="1" value={effectsBlur} onChange={(e) => setEffectsBlur(parseInt(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-white cursor-pointer" />
                                </div>

                                <label className="flex items-center justify-between text-sm text-white/70 cursor-pointer">
                                   <span>Rain</span>
                                   <input type="checkbox" checked={showRain} onChange={(e) => setShowRain(e.target.checked)} className="accent-white scale-110" />
                                </label>
                                <label className="flex items-center justify-between text-sm text-white/70 cursor-pointer">
                                   <span>Fireworks</span>
                                   <input type="checkbox" checked={showFireworks} onChange={(e) => setShowFireworks(e.target.checked)} className="accent-white scale-110" />
                                </label>
                                <label className="flex items-center justify-between text-sm text-white/70 cursor-pointer">
                                   <span>Light Spots (Bokeh)</span>
                                   <input type="checkbox" checked={showBokeh} onChange={(e) => setShowBokeh(e.target.checked)} className="accent-white scale-110" />
                                </label>
                             </div>
                          </div>
                        )}
                      </div>
                   </div>

                   <LyricsView 
                     lyrics={lyrics} 
                     currentTime={currentTime + lyricsOffset} 
                     isLoading={geminiLoading}
                     fillColor={customColor}
                     fontSizeScale={fontSizeScale}
                   />
               </div>
            </div>

        </div>

        {/* Hidden Inputs */}
        <input type="file" accept="audio/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        <input type="file" accept=".lrc" ref={lrcInputRef} onChange={handleLrcFileChange} className="hidden" />
        <input type="file" accept="image/*" ref={coverInputRef} onChange={handleCoverChange} className="hidden" />

        <audio 
          ref={audioRef}
          onTimeUpdate={handleNativeTimeUpdate}
          onEnded={() => setPlaybackState(PlaybackState.STOPPED)}
        />
    </div>
  );
};

export default App;