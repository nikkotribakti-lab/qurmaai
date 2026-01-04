
import React, { useState, useRef, useEffect } from 'react';
import { Message, ChatSession } from './types';
import { createIslamicChat, analyzeImage, transcribeAudio } from './services/geminiService';
import { SUGGESTIONS, Icons } from './constants';
import ChatMessage from './components/ChatMessage';

const LOCAL_STORAGE_KEY = 'qurma_portal_history_v3';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chatSession, setChatSession] = useState<any>(null);
  const [useSearch, setUseSearch] = useState(false);
  
  // Feature states
  const [selectedImage, setSelectedImage] = useState<{data: string, mime: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  // Sync current messages
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages, lastUpdated: new Date().toISOString(), title: s.title === 'Sesi Baru' ? messages[0].text.substring(0, 30) + '...' : s.title } 
          : s
      ));
    }
  }, [messages, currentSessionId]);

  useEffect(() => {
    try {
      const session = createIslamicChat(useSearch);
      setChatSession(session);
    } catch (error) {
      console.error("Initialization Error:", error);
    }
  }, [currentSessionId, useSearch]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const startNewSession = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'Sesi Baru',
      messages: [],
      lastUpdated: new Date().toISOString()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setMessages([]);
    setIsSidebarOpen(false);
  };

  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setIsSidebarOpen(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); 
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  const clearAllHistory = () => {
    if (window.confirm("Apakah Anda yakin ingin menghapus semua riwayat percakapan? Tindakan ini tidak dapat dibatalkan.")) {
      setSessions([]);
      setCurrentSessionId(null);
      setMessages([]);
    }
  };

  const onRefined = (originalId: string, refinedText: string) => {
    // We treat refined text as a new bot message
    const refinedMsg: Message = {
      id: Date.now().toString(),
      role: 'model',
      text: refinedText,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, refinedMsg]);
  };

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || input.trim();
    if (!textToSend && !selectedImage) return;
    if (isLoading) return;

    let activeId = currentSessionId;
    if (!activeId) {
      const newId = Date.now().toString();
      const newSession: ChatSession = {
        id: newId,
        title: textToSend ? textToSend.substring(0, 30) + '...' : "Analisis Gambar",
        messages: [],
        lastUpdated: new Date().toISOString()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newId);
      activeId = newId;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend || (selectedImage ? "[Mengunggah Gambar untuk Analisis]" : ""),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      if (selectedImage) {
        const resultText = await analyzeImage(textToSend || "Tolong jelaskan gambar ini dari perspektif keislaman.", selectedImage.data, selectedImage.mime);
        const botMessage: Message = {
          id: Date.now().toString(),
          role: 'model',
          text: resultText || "Maaf, terjadi kesalahan.",
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, botMessage]);
        setSelectedImage(null);
      } else {
        const botMsgId = (Date.now() + 1).toString();
        // Create an empty bot message for streaming effect
        setMessages(prev => [...prev, {
          id: botMsgId,
          role: 'model',
          text: "",
          timestamp: new Date().toISOString(),
        }]);

        const stream = await chatSession.sendMessageStream({ message: textToSend });
        let fullText = "";
        for await (const chunk of stream) {
          fullText += chunk.text;
          setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: fullText } : m));
        }
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "Terjadi kesalahan koneksi. Silakan coba lagi.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup Silence Detection
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            setIsLoading(true);
            try {
              const transcription = await transcribeAudio(base64);
              if (transcription) {
                setInput(prev => prev + (prev ? " " : "") + transcription);
              }
            } catch (e) {
              console.error("Transcription failed", e);
            } finally {
              setIsLoading(false);
            }
          };
          reader.readAsDataURL(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };

        const checkSilence = () => {
          if (!analyserRef.current || !isRecording) return;
          
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;

          // Threshold for "silence" 
          if (average < 10) { 
            if (!silenceTimerRef.current) {
              silenceTimerRef.current = window.setTimeout(() => {
                console.log("Auto-stopping due to 1s silence");
                stopRecording();
              }, 1000);
            }
          } else {
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          }

          if (mediaRecorder.state === 'recording') {
            requestAnimationFrame(checkSilence);
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
        requestAnimationFrame(checkSilence);

      } catch (err) {
        console.error("Recording error", err);
      }
    }
  };

  const handleImageClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setSelectedImage({ data: base64, mime: file.type });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div className="flex h-screen max-w-screen-xl mx-auto bg-white text-stone-900 overflow-hidden md:border-x border-stone-200 shadow-2xl relative">
      
      {/* Sidebar - Elegant Dark Green Glassmorphism */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 sidebar-glass transform transition-transform duration-500 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 border-r border-white/10`}>
        <div className="flex flex-col h-full">
          <div className="p-8 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 shadow-2xl rounded-xl overflow-hidden glass-effect p-1 border border-white/20">
                <Icons.Bot />
              </div>
              <span className="text-white font-extrabold tracking-tight text-lg">QurMa <span className="text-[#c5a059]">AI</span></span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-white/50 hover:text-white transition-colors">
              <Icons.Close />
            </button>
          </div>

          <div className="px-6 space-y-3 mb-8">
            <button 
              onClick={startNewSession}
              className="w-full flex items-center justify-center space-x-2 py-3 gold-gradient hover:brightness-110 text-[#062c1d] rounded-2xl font-bold shadow-xl active:scale-95 transition-all"
            >
              <Icons.Plus />
              <span>Sesi Baru</span>
            </button>
            <button 
              onClick={() => setIsLiveMode(true)}
              className="w-full flex items-center justify-center space-x-2 py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-bold border border-white/10 transition-all"
            >
              <Icons.Sparkles />
              <span>Live Voice Mode</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-6 custom-scrollbar">
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-100/30 font-bold mb-6 flex items-center justify-between px-3">
              <div className="flex items-center">
                <Icons.Clock />
                <span className="ml-2">Arsip Percakapan</span>
              </div>
              {sessions.length > 0 && (
                <button 
                  onClick={clearAllHistory}
                  className="hover:text-red-400 transition-colors p-1"
                  title="Bersihkan Semua"
                >
                  <Icons.Delete />
                </button>
              )}
            </div>
            
            <div className="space-y-2">
              {sessions.map(s => (
                <div 
                  key={s.id}
                  onClick={() => loadSession(s)}
                  className={`group relative p-4 rounded-2xl cursor-pointer flex items-center justify-between border transition-all ${
                    currentSessionId === s.id 
                    ? 'bg-white/10 border-white/20 text-white shadow-lg' 
                    : 'bg-transparent border-transparent text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-start space-x-3 overflow-hidden">
                    <div className={`mt-0.5 shrink-0 ${currentSessionId === s.id ? 'text-[#c5a059]' : 'text-white/10'}`}>
                      <Icons.ChatBubble />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-semibold truncate leading-tight">{s.title}</p>
                      <p className="text-[10px] opacity-40 mt-1 font-bold">{new Date(s.lastUpdated).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={(e) => deleteSession(e, s.id)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all rounded-lg hover:bg-white/10"
                    title="Hapus riwayat"
                  >
                    <Icons.Delete />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative bg-white diamond-pattern overflow-hidden">
        
        {/* Modern Library Header */}
        <header className="glass-effect p-4 md:p-6 flex items-center justify-between z-40 border-b border-stone-100 shadow-sm sticky top-0">
          <div className="flex items-center space-x-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-3 text-[#062c1d] hover:bg-stone-100 rounded-full transition-all">
              <Icons.Menu />
            </button>
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 shadow-2xl rounded-2xl overflow-hidden bg-[#062c1d] p-1 border border-[#c5a059]/30">
                <Icons.Bot />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-extrabold text-xl tracking-tight text-[#062c1d] leading-none">QurMa <span className="text-[#c5a059]">AI</span></h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#c5a059] font-black mt-1.5 opacity-80">Advanced Islamic Intelligence</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setUseSearch(!useSearch)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[11px] font-extrabold transition-all border ${
                useSearch ? 'bg-[#c5a059] text-[#062c1d] border-[#c5a059] shadow-lg shadow-amber-500/20' : 'bg-stone-50 text-stone-400 border-stone-100 hover:border-stone-200'
              }`}
            >
              <Icons.Search />
              <span>SEARCH {useSearch ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </header>

        {/* Chat Flow Container */}
        <main className="flex-1 overflow-y-auto px-6 py-10 md:px-20 relative custom-scrollbar scroll-smooth" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-12 max-w-2xl mx-auto py-12">
              <div className="space-y-6 animate-in fade-in zoom-in duration-1000">
                <div className="w-24 h-24 mx-auto shadow-[0_32px_64px_-12px_rgba(6,44,29,0.3)] rounded-[2.5rem] overflow-hidden bg-[#062c1d] p-1.5 border-2 border-[#c5a059]/20">
                  <Icons.Bot />
                </div>
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-[#062c1d] tracking-tight">Ahlan wa Sahlan.</h2>
                  <p className="text-stone-400 font-medium text-lg">Asisten AI Perpustakaan Digital siap melayani riset Islami Anda.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {SUGGESTIONS.map((s, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => handleSendMessage(s.prompt)} 
                    className="p-5 bg-white border border-stone-100 rounded-[2rem] hover:border-[#c5a059] hover:shadow-xl hover:shadow-amber-500/5 text-left transition-all group flex items-center space-x-5"
                  >
                    <span className="text-3xl bg-stone-50 p-3 rounded-2xl group-hover:scale-110 group-hover:bg-amber-50 transition-all">{s.icon}</span>
                    <span className="text-[15px] font-bold text-[#062c1d] opacity-80 group-hover:opacity-100">{s.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8 pb-10">
              {messages.map(msg => <ChatMessage key={msg.id} message={msg} onRefined={onRefined} />)}
            </div>
          )}
          {isLoading && !messages[messages.length-1]?.text && (
            <div className="max-w-4xl mx-auto p-4 flex items-center space-x-3">
               <div className="w-2 h-2 rounded-full bg-[#c5a059] animate-bounce"></div>
               <div className="w-2 h-2 rounded-full bg-[#c5a059] animate-bounce [animation-delay:-0.15s]"></div>
               <div className="w-2 h-2 rounded-full bg-[#c5a059] animate-bounce [animation-delay:-0.3s]"></div>
               <span className="text-[10px] font-black text-[#062c1d]/30 uppercase tracking-[0.3em] ml-2">Menganalisis...</span>
            </div>
          )}
        </main>

        {/* Premium Input Section */}
        <footer className="p-6 md:p-10 bg-white border-t border-stone-50 z-40 relative">
          <div className="max-w-4xl mx-auto relative">
            
            {/* Image Preview Overlay */}
            {selectedImage && (
              <div className="absolute bottom-full left-0 mb-6 p-4 glass-effect rounded-[2rem] flex items-center space-x-4 border border-[#c5a059]/20 shadow-2xl animate-in slide-in-from-bottom-4">
                <div className="w-14 h-14 bg-[#062c1d] rounded-2xl flex items-center justify-center text-[#c5a059] shadow-inner overflow-hidden">
                  <Icons.Image />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-[#062c1d] uppercase tracking-widest">Analisis Gambar Aktif</span>
                  <span className="text-[9px] text-stone-400 font-bold uppercase tracking-widest">Didukung Gemini 3 Pro</span>
                </div>
                <button onClick={() => setSelectedImage(null)} className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all ml-4">
                  <Icons.Close />
                </button>
              </div>
            )}
            
            <div className="bg-stone-50 p-2 rounded-[2.5rem] border border-stone-100 focus-within:border-[#c5a059] focus-within:ring-4 focus-within:ring-amber-500/5 transition-all shadow-sm flex items-end">
              <button 
                onClick={handleImageClick} 
                className="p-4 text-stone-300 hover:text-[#062c1d] transition-colors rounded-full"
                title="Unggah Kitab/Gambar"
              >
                <Icons.Image />
              </button>
              
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                placeholder="Tulis pertanyaan Anda seputar Al-Quran & Hadis..."
                className="flex-1 bg-transparent py-4 focus:outline-none resize-none max-h-40 min-h-[56px] text-stone-900 placeholder:text-stone-300 font-medium text-[15px]"
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
              
              <div className="flex items-center p-2 space-x-2">
                <button 
                  onClick={toggleRecording} 
                  title={isRecording ? "Mendengarkan..." : "Gunakan Suara"}
                  className={`p-4 rounded-full transition-all shadow-md ${
                    isRecording 
                      ? 'bg-red-500 text-white animate-pulse scale-110 ring-4 ring-red-500/10' 
                      : 'bg-white text-stone-400 hover:text-[#062c1d] border border-stone-100 hover:border-stone-200'
                  }`}
                >
                  <Icons.Microphone />
                </button>
                <button
                  disabled={(!input.trim() && !selectedImage) || isLoading}
                  onClick={() => handleSendMessage()}
                  className={`p-4 rounded-full transition-all shadow-xl shadow-[#062c1d]/10 ${
                    (input.trim() || selectedImage) && !isLoading 
                      ? 'bg-[#062c1d] text-white hover:brightness-125 hover:scale-105 active:scale-95' 
                      : 'bg-stone-100 text-stone-200'
                  }`}
                >
                  <Icons.Send />
                </button>
              </div>
            </div>
            
            <p className="mt-6 text-center text-[9px] text-stone-300 font-bold uppercase tracking-[0.3em] animate-pulse">
              Gemini Intelligence Powered • Digital Library Companion
            </p>
          </div>
        </footer>
      </div>

      {/* Live Voice Overlay - Elegant High-End Aesthetic */}
      {isLiveMode && (
        <div className="fixed inset-0 z-[100] sidebar-glass flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
          <button 
            onClick={() => setIsLiveMode(false)} 
            className="absolute top-10 right-10 p-4 text-white/40 hover:text-white transition-all bg-white/5 rounded-full border border-white/5"
          >
            <Icons.Close />
          </button>
          
          <div className="text-center space-y-12 max-w-lg w-full">
            <div className="relative group">
               <div className="absolute inset-0 bg-[#c5a059] blur-[100px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
               <div className="relative w-48 h-48 gold-gradient rounded-[3.5rem] mx-auto flex items-center justify-center shadow-[0_40px_100px_-15px_rgba(197,160,89,0.5)] animate-pulse border-4 border-white/20">
                 <div className="w-24 h-24 text-[#062c1d] scale-150">
                    <Icons.Audio />
                 </div>
               </div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-white text-4xl font-black tracking-tight">QurMa Live</h2>
              <p className="text-emerald-100/60 font-bold text-lg uppercase tracking-widest px-6">Bicara Langsung Dengan Pustakawan AI Anda</p>
            </div>

            <div className="h-24 flex items-center justify-center space-x-3">
              {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <div 
                  key={i} 
                  className="w-1.5 bg-[#c5a059] rounded-full animate-bounce"
                  style={{ 
                    height: `${20 + Math.random() * 60}%`, 
                    animationDelay: `-${i * 0.15}s` 
                  }}
                ></div>
              ))}
            </div>

            <button 
              onClick={() => setIsLiveMode(false)}
              className="px-12 py-5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/40 rounded-full font-black uppercase tracking-[0.2em] text-xs transition-all hover:scale-105 active:scale-95 shadow-2xl"
            >
              Tutup Sesi Voice
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
