
import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Play, Pause, Square, Loader2, Volume2, Sliders, Activity, RefreshCw, Repeat, Clock, Music4, Settings2, Mic2, Save, Download, Database, LayoutGrid } from 'lucide-react';
import { generateMusicalPattern } from '../services/gemini';
import { saveMusicalPattern, getMusicalPatterns, MusicalPattern } from '../services/firestore';

// Mapeo de instrumentos de Tone.js
const INSTRUMENTS: Record<string, any> = {
  'Classic Synth': Tone.Synth,
  'FM Synth (Retro)': Tone.FMSynth,
  'AM Synth (Suave)': Tone.AMSynth,
  'Membrane (Percusivo)': Tone.MembraneSynth,
  'DuoSynth (Grueso)': Tone.DuoSynth,
};

interface SynthLabProps {
  appInstance?: any; // For Firebase saves
  uid?: string;      // Current User ID
}

export const SynthLab: React.FC<SynthLabProps> = ({ appInstance, uid }) => {
  // --- STATE: AI & DATA ---
  const [style, setStyle] = useState("Techno Minimalista");
  const [songData, setSongData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  
  // Persistence State
  const [isSaving, setIsSaving] = useState(false);
  const [savedPatterns, setSavedPatterns] = useState<MusicalPattern[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  // --- STATE: AUDIO ENGINE ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [currentTime, setCurrentTime] = useState("0:0:0");

  // --- STATE: MASTER CONTROLS ---
  const [masterVol, setMasterVol] = useState(-5);
  const [masterBpm, setMasterBpm] = useState(120);
  const [selectedInst, setSelectedInst] = useState('FM Synth (Retro)');

  // --- STATE: 5-TRACK MIXER ---
  const [volDrums, setVolDrums] = useState(0);
  const [volBass, setVolBass] = useState(0);
  const [volMelody, setVolMelody] = useState(0);
  const [volHarmony, setVolHarmony] = useState(-2);
  const [volPad, setVolPad] = useState(-5);

  // --- REFS ---
  const channels = useRef<any>({
    drums: null,
    bass: null,
    melody: null,
    harmony: null, // New
    pad: null,     // New
    reverb: null
  });
  
  const parts = useRef<any[]>([]);
  const apiKey = localStorage.getItem('gemini_api_key') || "";
  const isMounted = useRef(true);

  // --- EFFECTS ---

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      handleStop();
      Object.values(channels.current).forEach((inst: any) => {
        if (inst && !inst.disposed) inst.dispose();
      });
    };
  }, []);

  // Persistence Load
  useEffect(() => {
    if (showLibrary && appInstance) {
      loadLibrary();
    }
  }, [showLibrary, appInstance]);

  const loadLibrary = async () => {
    try {
      const patterns = await getMusicalPatterns(appInstance);
      setSavedPatterns(patterns);
    } catch (e) {
      console.error("Failed to load library", e);
    }
  };

  // Master Controls Effects
  useEffect(() => {
    if (Tone.Destination) Tone.Destination.volume.rampTo(masterVol, 0.1);
  }, [masterVol]);

  useEffect(() => {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.bpm.rampTo(masterBpm, 0.1);
    } else {
      Tone.Transport.bpm.value = masterBpm;
    }
  }, [masterBpm]);

  // Instrument Switcher
  useEffect(() => {
    if (channels.current.reverb && audioReady) {
      changeMelodyInstrument(selectedInst);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInst]);

  // Mixer updates
  useEffect(() => {
    if (channels.current.drums && !channels.current.drums.disposed) channels.current.drums.volume.rampTo(volDrums, 0.1);
    if (channels.current.bass && !channels.current.bass.disposed) channels.current.bass.volume.rampTo(volBass, 0.1);
    if (channels.current.melody && !channels.current.melody.disposed) channels.current.melody.volume.rampTo(volMelody, 0.1);
    if (channels.current.harmony && !channels.current.harmony.disposed) channels.current.harmony.volume.rampTo(volHarmony, 0.1);
    if (channels.current.pad && !channels.current.pad.disposed) channels.current.pad.volume.rampTo(volPad, 0.1);
  }, [volDrums, volBass, volMelody, volHarmony, volPad]);

  // --- AUDIO ENGINE SETUP ---
  
  const setupAudioEngine = async () => {
    if (channels.current.drums) return;
    
    setLoadingAudio(true);
    await Tone.start();

    try {
      // 1. Drums (Sampler)
      const drums = await new Promise<any>((resolve) => {
        const s = new Tone.Sampler({
          urls: { C1: "kick.mp3", D1: "snare.mp3", "F#1": "hihat.mp3" },
          baseUrl: "https://tonejs.github.io/audio/drum-samples/acoustic-kit/",
          onload: () => resolve(s)
        }).toDestination();
      });

      // 2. Bass (Sampler)
      const bass = await new Promise<any>((resolve) => {
        const s = new Tone.Sampler({
          urls: { C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3" }, // Using lower octave samples if available, or shifting pitch
          baseUrl: "https://tonejs.github.io/audio/salamander/",
          onload: () => resolve(s)
        }).toDestination();
      });

      // 3. Harmony (Sampler - Piano)
      const harmony = await new Promise<any>((resolve) => {
        const s = new Tone.Sampler({
          urls: { C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3" },
          baseUrl: "https://tonejs.github.io/audio/salamander/",
          onload: () => resolve(s)
        }).toDestination();
      });

      // 4. Pad (AMSynth for atmosphere)
      const reverb = new Tone.Reverb(4).toDestination();
      await reverb.generate();
      const pad = new Tone.PolySynth(Tone.AMSynth).connect(reverb);
      pad.set({ oscillator: { type: "sine" }, envelope: { attack: 0.5, release: 1 } });

      // 5. Melody (Dynamic)
      const SynthClass = INSTRUMENTS[selectedInst] || Tone.FMSynth;
      const melody = new Tone.PolySynth(SynthClass).connect(reverb);
      
      channels.current = { drums, bass, harmony, pad, melody, reverb };
      
      if (isMounted.current) {
        setAudioReady(true);
        setLoadingAudio(false);
      }
    } catch (e) {
      console.error("Audio Load Error:", e);
      if (isMounted.current) setLoadingAudio(false);
    }
  };

  const changeMelodyInstrument = (instName: string) => {
    const oldSynth = channels.current.melody;
    const reverb = channels.current.reverb;
    
    if (!reverb || reverb.disposed) return;

    const SynthClass = INSTRUMENTS[instName] || Tone.FMSynth;
    const newSynth = new Tone.PolySynth(SynthClass).connect(reverb);
    newSynth.volume.value = volMelody;
    
    channels.current.melody = newSynth;
    
    if (oldSynth && !oldSynth.disposed) {
      try { oldSynth.dispose(); } catch (e) { console.warn("Dispose error", e); }
    }
  };

  // --- HANDLERS ---

  const handleCompose = async () => {
    if (!apiKey) return alert("Falta API Key de Gemini");
    setLoading(true);
    setSongData(null);
    handleStop();
    
    // Fixed 4-bar loop generation
    const result = await generateMusicalPattern(apiKey, style);
    
    if (result.success) {
      setSongData(result.data);
      if (result.data.bpm) setMasterBpm(result.data.bpm);
    } else {
      alert("Error: " + result.message);
    }
    setLoading(false);
  };

  const handleSavePattern = async () => {
    if (!songData || !appInstance || !uid) return alert("Necesitas estar conectado a Firebase y haber generado un patrón.");
    setIsSaving(true);
    try {
      await saveMusicalPattern(appInstance, uid, {
        style: style,
        bpm: songData.bpm || 120,
        tracks: songData.tracks,
        duration: 4 // Standard 4 bars
      });
      alert("¡Patrón guardado en la nube!");
      loadLibrary(); // Refresh
    } catch (e: any) {
      alert("Error al guardar: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadPattern = (pattern: MusicalPattern) => {
    setSongData({
      bpm: pattern.bpm,
      tracks: pattern.tracks,
      timeSignature: "4/4"
    });
    setMasterBpm(pattern.bpm);
    setStyle(pattern.style); // Update UI text
    setShowLibrary(false);
    handleStop();
  };

  const handlePlay = async () => {
    if (!songData) return;
    if (!audioReady) await setupAudioEngine();
    
    if (!channels.current.drums || !channels.current.drums.loaded) {
      if (!audioReady) return; 
    }
    
    parts.current.forEach(p => p.dispose());
    parts.current = [];
    Tone.Transport.cancel();

    Tone.Transport.bpm.value = masterBpm;
    Tone.Transport.loop = true; // Always loop in Pattern Mode
    Tone.Transport.loopEnd = "4:0:0"; // Fixed 4 bars loop

    // --- SCHEDULE TRACKS ---
    const scheduleTrack = (trackData: any[], instrument: any, midiMap: boolean = false) => {
      if (!trackData || !instrument || instrument.disposed) return;
      const part = new Tone.Part((time, note: any) => {
         if (instrument.disposed) return;
         if (midiMap) {
            // Drum Mapping
            let midi = "C1";
            if (note.instrument === 'snare') midi = "D1";
            if (note.instrument === 'hihat') midi = "F#1";
            instrument.triggerAttackRelease(midi, "8n", time);
         } else {
            instrument.triggerAttackRelease(note.note, note.duration, time);
         }
      }, trackData).start(0);
      parts.current.push(part);
    };

    scheduleTrack(songData.tracks.drums, channels.current.drums, true);
    scheduleTrack(songData.tracks.bass, channels.current.bass);
    scheduleTrack(songData.tracks.melody, channels.current.melody);
    scheduleTrack(songData.tracks.harmony, channels.current.harmony);
    scheduleTrack(songData.tracks.pad, channels.current.pad);

    Tone.Transport.start();
    setIsPlaying(true);

    const animate = () => {
      if (!isMounted.current) return;
      if (Tone.Transport.state === 'started') {
        const rawPos = Tone.Transport.position.toString().split('.')[0];
        setCurrentTime(rawPos);
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  };

  const handlePause = () => {
    Tone.Transport.pause();
    setIsPlaying(false);
  };

  const handleStop = () => {
    Tone.Transport.stop();
    setIsPlaying(false);
    setCurrentTime("0:0:0");
  };

  // --- RENDER HELPERS ---
  
  const renderTrackLane = (trackName: string, notes: any[], color: string) => {
    if (!notes) return <div className="h-full w-full flex items-center justify-center text-slate-800 text-xs italic bg-slate-900/50">Vacío</div>;
    return (
      <div className="relative h-12 bg-slate-900 border-b border-slate-800 w-full overflow-hidden group">
        <span className="absolute left-2 top-2 text-[9px] font-bold z-10 uppercase opacity-50 group-hover:opacity-100 transition-opacity" style={{ color }}>{trackName}</span>
        {notes.map((note, i) => {
          const [bar, beat, six] = note.time.split(':').map(Number);
          const totalSixteenths = (bar * 16) + (beat * 4) + six;
          const leftPercent = (totalSixteenths / 64) * 100; // 4 bars * 16 sixteenths = 64
          return (
            <div 
              key={i}
              className="absolute h-3/5 top-1/2 -translate-y-1/2 rounded-sm opacity-80"
              style={{ left: `${leftPercent}%`, width: '1.5%', backgroundColor: color }}
            />
          );
        })}
      </div>
    );
  };

  const renderVerticalSlider = (value: number, setValue: (val: number) => void, colorClass: string) => (
    <div className="h-28 w-8 flex items-center justify-center bg-slate-950 rounded-lg border border-slate-800 group-hover:border-slate-700 transition-colors">
      <input 
        type="range" min="-40" max="0" 
        value={value} 
        onChange={e => setValue(Number(e.target.value))}
        className={`w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer -rotate-90 ${colorClass}`}
      />
    </div>
  );

  return (
    <div className="bg-slate-950 text-white rounded-xl shadow-2xl border border-slate-800 overflow-hidden animate-in fade-in duration-500 font-sans relative">
      
      {/* LIBRARY MODAL */}
      {showLibrary && (
        <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-sm p-8 flex items-center justify-center">
          <div className="bg-slate-950 border border-slate-700 rounded-xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2"><Database size={18} className="text-blue-500" /> Librería de Patrones</h3>
              <button onClick={() => setShowLibrary(false)} className="p-1 hover:bg-slate-800 rounded"><Square size={18} fill="white" className="rotate-45" /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {savedPatterns.length === 0 && <p className="text-slate-500 text-sm text-center py-10">No hay patrones guardados.</p>}
              {savedPatterns.map((p) => (
                <div key={p.id} className="bg-slate-900 hover:bg-slate-800 p-3 rounded-lg border border-slate-800 flex justify-between items-center transition-colors">
                  <div>
                    <div className="font-bold text-sm text-white">{p.style}</div>
                    <div className="text-xs text-slate-500 font-mono">{p.bpm} BPM • 4 Bars • {new Date(p.createdAt.seconds * 1000).toLocaleDateString()}</div>
                  </div>
                  <button onClick={() => handleLoadPattern(p)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded flex items-center gap-1">
                    <Download size={12} /> Cargar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-slate-900 p-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg shadow-lg shadow-cyan-500/20">
             <Activity className="text-white" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">SynthLab <span className="text-cyan-400">Pro</span></h2>
            <p className="text-slate-500 text-[10px] uppercase tracking-wider">Modular AI Workstation</p>
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-4 bg-slate-950 px-6 py-2 rounded-full border border-slate-800 shadow-inner">
           <button 
             onClick={isPlaying ? handlePause : handlePlay}
             disabled={!songData || (loadingAudio && !audioReady)}
             className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg hover:scale-105 ${
               isPlaying ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white disabled:bg-slate-800 disabled:text-slate-600'
             }`}
           >
             {loadingAudio && !audioReady ? <Loader2 className="animate-spin" size={18} /> : isPlaying ? <Pause fill="currentColor" size={18} /> : <Play fill="currentColor" className="ml-1" size={18} />}
           </button>
           <button onClick={handleStop} disabled={!isPlaying} className="text-slate-400 hover:text-red-500"><Square size={16} fill="currentColor" /></button>
           <div className="h-6 w-px bg-slate-800 mx-2" />
           <span className="text-lg font-mono text-emerald-400 tracking-widest">{currentTime}</span>
           <div className="h-6 w-px bg-slate-800 mx-2" />
           <div className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded flex gap-1"><Repeat size={12}/> LOOP</div>
        </div>
        
        {/* Persistence Controls */}
        <div className="flex gap-2">
           <button onClick={() => setShowLibrary(true)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300" title="Abrir Librería"><Database size={18}/></button>
           <button onClick={handleSavePattern} disabled={isSaving || !songData} className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white disabled:opacity-50" title="Guardar Patrón"><Save size={18}/></button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 h-full min-h-[500px]">
        
        {/* LEFT PANEL: COMPOSER */}
        <div className="lg:col-span-3 bg-slate-900 border-r border-slate-800 p-5 flex flex-col gap-4">
          <div className="space-y-4">
             <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Music4 size={12} /> Generator</h3>
             <textarea 
               value={style} onChange={(e) => setStyle(e.target.value)}
               className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-cyan-500 outline-none h-20 resize-none"
               placeholder="Prompt..."
             />
             <button 
               onClick={handleCompose} disabled={loading}
               className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-lg font-bold shadow-lg transition-all flex justify-center items-center gap-2 disabled:opacity-50"
             >
               {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />} Generar Patrón
             </button>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-4">
             <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Settings2 size={12} /> Master Channel</h3>
             <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Gain</span>
                <input type="range" min="-60" max="0" value={masterVol} onChange={(e) => setMasterVol(Number(e.target.value))} className="w-24 h-1 bg-slate-700 rounded-lg appearance-none accent-white"/>
             </div>
             <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">BPM</span>
                <input type="range" min="60" max="200" value={masterBpm} onChange={(e) => setMasterBpm(Number(e.target.value))} className="w-24 h-1 bg-slate-700 rounded-lg appearance-none accent-emerald-500"/>
             </div>
             <div className="space-y-1">
                <span className="text-[10px] text-purple-400 font-bold uppercase">Lead Synth</span>
                <select value={selectedInst} onChange={(e) => setSelectedInst(e.target.value)} className="w-full p-1.5 bg-slate-950 border border-slate-700 rounded text-xs text-white outline-none">
                  {Object.keys(INSTRUMENTS).map(inst => <option key={inst} value={inst}>{inst}</option>)}
                </select>
             </div>
          </div>
        </div>

        {/* CENTER PANEL: ARRANGEMENT & MIXER */}
        <div className="lg:col-span-9 flex flex-col bg-slate-950">
          {/* ARRANGEMENT VIEW */}
          <div className="flex-1 p-4 relative overflow-hidden flex flex-col">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase flex gap-1"><LayoutGrid size={12}/> Arrangement View (4 Bars)</span>
                {songData && <span className="text-[10px] text-slate-600">{songData.key} • {songData.timeSignature}</span>}
             </div>
             <div className="flex-1 border border-slate-800 rounded-lg bg-slate-900/30 overflow-hidden flex flex-col relative">
               <div className="absolute inset-0 flex pointer-events-none opacity-5">
                 {[...Array(16)].map((_, i) => <div key={i} className="flex-1 border-r border-slate-500 h-full" />)}
               </div>
               {/* Playhead */}
               <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 shadow-[0_0_8px_red] transition-all duration-75 left-0" 
                    style={{ left: isPlaying ? `${(Tone.Transport.seconds / (Tone.Transport.bpm.value/60 * 16)) * 100}%` : '0%' }} 
               />
               <div className="flex-1 flex flex-col">
                 {renderTrackLane("Melody", songData?.tracks?.melody, "#a855f7")}
                 {renderTrackLane("Harmony", songData?.tracks?.harmony, "#3b82f6")}
                 {renderTrackLane("Pad", songData?.tracks?.pad, "#ec4899")}
                 {renderTrackLane("Bass", songData?.tracks?.bass, "#6366f1")}
                 {renderTrackLane("Drums", songData?.tracks?.drums, "#f97316")}
               </div>
             </div>
          </div>

          {/* 5-TRACK MIXER */}
          <div className="h-40 bg-slate-900 border-t border-slate-800 p-4">
            <div className="flex justify-center gap-4 h-full">
               {[
                 { lbl: 'Drums', vol: volDrums, set: setVolDrums, col: 'accent-orange-500', txt: 'text-orange-500' },
                 { lbl: 'Bass', vol: volBass, set: setVolBass, col: 'accent-indigo-500', txt: 'text-indigo-500' },
                 { lbl: 'Pad', vol: volPad, set: setVolPad, col: 'accent-pink-500', txt: 'text-pink-500' },
                 { lbl: 'Harm', vol: volHarmony, set: setVolHarmony, col: 'accent-blue-500', txt: 'text-blue-500' },
                 { lbl: 'Lead', vol: volMelody, set: setVolMelody, col: 'accent-purple-500', txt: 'text-purple-500' },
               ].map((ch, i) => (
                 <div key={i} className="flex flex-col items-center gap-1 group w-12">
                   {renderVerticalSlider(ch.vol, ch.set, ch.col)}
                   <span className={`text-[9px] font-bold uppercase ${ch.txt}`}>{ch.lbl}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
