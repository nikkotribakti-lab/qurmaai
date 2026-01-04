
import React, { useState } from 'react';
import { Message } from '../types';
import { Icons } from '../constants';
import { generateSpeech, refineContent } from '../services/geminiService';

interface ChatMessageProps {
  message: Message;
  onRefined?: (originalId: string, refinedText: string) => void;
}

// Audio helper functions
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRefined }) => {
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [showIntelMenu, setShowIntelMenu] = useState(false);
  const isBot = message.role === 'model';
  
  const hasAnyArabic = /[\u0600-\u06FF]/.test(message.text);

  const handleIntelAction = async (action: 'summarize' | 'kids' | 'academic' | 'related') => {
    setIsRefining(true);
    setShowIntelMenu(false);
    try {
      const result = await refineContent(message.text, action);
      if (result && onRefined) {
        onRefined(message.id, result);
      }
    } catch (e) {
      console.error("Refining failed", e);
    } finally {
      setIsRefining(false);
    }
  };

  const formatText = (text: string, isLarge: boolean = false) => {
    if (!text && isBot) return <div className="typing-indicator flex space-x-1 py-2"><div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.1s]"></div><div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.2s]"></div></div>;
    
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return <div key={i} className={isLarge ? "h-6" : "h-2"}></div>;

      const hasArabic = /[\u0600-\u06FF]/.test(line);
      const isItalicized = (line.startsWith('*') && line.endsWith('*')) || (line.startsWith('_') && line.endsWith('_'));
      const isTransliteration = isItalicized && i > 0 && /[\u0600-\u06FF]/.test(lines[i-1]);
      
      let content: React.ReactNode = line;
      if (line.startsWith('**') && line.endsWith('**')) {
        content = <strong className={isLarge ? 'text-[#062c1d] block text-3xl mb-4 font-bold' : 'font-bold text-[#c5a059]'}>{line.replace(/\*\*/g, '')}</strong>;
      } else if (line.startsWith('>')) {
        content = (
          <blockquote className={`border-l-4 border-[#c5a059] pl-4 italic ${isLarge ? 'text-2xl text-stone-600 my-6' : 'text-stone-300 my-2'}`}>
            {line.replace(/^>\s?/, '')}
          </blockquote>
        );
      } else if (isTransliteration) {
        content = (
          <span className={`block font-medium text-[#c5a059] ${isLarge ? 'text-2xl mt-[-1rem] mb-6' : 'text-sm mt-[-0.5rem] mb-3'} italic opacity-90`}>
            {line.replace(/[*_]/g, '')}
          </span>
        );
      }

      return (
        <p 
          key={i} 
          className={`leading-relaxed ${
            hasArabic 
              ? `font-arabic text-right ${isLarge ? 'text-6xl leading-[2] py-10 text-[#062c1d]' : 'text-4xl py-3 text-white'}` 
              : isTransliteration 
                ? 'text-center'
                : `mb-3 ${isLarge ? 'text-2xl text-stone-900 max-w-3xl mx-auto' : 'text-[15px] text-white'}`
          }`}
          dir={hasArabic ? 'rtl' : 'ltr'}
        >
          {content}
        </p>
      );
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.text);
  };

  const handleSpeech = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      const cleanText = message.text.replace(/\*\*/g, '').replace(/> /g, '');
      const base64Audio = await generateSpeech(cleanText);
      if (base64Audio) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => setIsPlaying(false);
        source.start();
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.error("Speech generation failed", e);
      setIsPlaying(false);
    }
  };

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <div className={`flex w-full mb-6 message-enter ${isBot ? 'justify-start' : 'justify-end'}`}>
        <div className={`flex max-w-[85%] md:max-w-[75%] ${isBot ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg shadow-sm overflow-hidden ${
            isBot ? 'bg-[#062c1d] mr-3' : 'bg-stone-200 text-stone-500 ml-3'
          }`}>
            {isBot ? <Icons.Bot /> : <Icons.User />}
          </div>
          
          <div className="relative group flex flex-col items-start">
            <div className={`p-4 rounded-2xl shadow-sm border ${
              isBot 
                ? 'bg-[#062c1d]/90 border-white/10 text-white rounded-tl-none backdrop-blur-md' 
                : 'bg-[#b48f4b] border-[#c5a059] text-white rounded-tr-none shadow-md'
            }`}>
              <div className="message-content">
                {formatText(message.text)}
              </div>
              
              <div className={`mt-2 flex items-center text-[9px] font-bold tracking-widest ${isBot ? 'text-white/40' : 'text-white/60'}`}>
                <span>{formattedTime}</span>
              </div>
            </div>

            {/* Intel & Actions - Elegant Toolbar */}
            {isBot && message.text && (
              <div className="mt-2 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="relative">
                  <button 
                    onClick={() => setShowIntelMenu(!showIntelMenu)}
                    className={`flex items-center space-x-1 px-2 py-1 bg-stone-50 hover:bg-stone-100 rounded-md border border-stone-200 transition-all ${isRefining ? 'animate-pulse' : ''}`}
                    title="Gemini Intelligence"
                  >
                    <Icons.Sparkles />
                    <span className="text-[10px] font-bold text-[#062c1d]">Intel</span>
                  </button>
                  
                  {showIntelMenu && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border border-stone-100 overflow-hidden z-20 glass-effect">
                      <button onClick={() => handleIntelAction('summarize')} className="w-full text-left px-4 py-2 hover:bg-stone-50 text-xs font-bold text-[#062c1d] flex items-center space-x-2">
                        <Icons.Summarize /> <span>Ringkas Konten</span>
                      </button>
                      <button onClick={() => handleIntelAction('kids')} className="w-full text-left px-4 py-2 hover:bg-stone-50 text-xs font-bold text-[#062c1d] flex items-center space-x-2">
                        <Icons.Child /> <span>Bahasa Anak</span>
                      </button>
                      <button onClick={() => handleIntelAction('academic')} className="w-full text-left px-4 py-2 hover:bg-stone-50 text-xs font-bold text-[#062c1d] flex items-center space-x-2">
                        <Icons.Academic /> <span>Analisis Kitab</span>
                      </button>
                      <button onClick={() => handleIntelAction('related')} className="w-full text-left px-4 py-2 hover:bg-stone-50 text-xs font-bold text-[#062c1d] flex items-center space-x-2">
                        <Icons.Search /> <span>Eksplorasi Lanjut</span>
                      </button>
                    </div>
                  )}
                </div>

                <button onClick={handleSpeech} disabled={isPlaying} className={`p-1.5 hover:bg-amber-50 rounded-md text-[#c5a059] border border-transparent hover:border-amber-100 transition-all ${isPlaying ? 'animate-pulse' : ''}`}>
                  <Icons.Audio />
                </button>
                {hasAnyArabic && (
                  <button onClick={() => setIsReadingMode(true)} className="p-1.5 hover:bg-emerald-50 rounded-md text-[#062c1d] border border-transparent hover:border-emerald-100 transition-all">
                    <Icons.BookOpen />
                  </button>
                )}
                <button onClick={copyToClipboard} className="p-1.5 hover:bg-stone-50 rounded-md text-stone-400 transition-all">
                  <Icons.Copy />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isReadingMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 sidebar-glass animate-in fade-in duration-300">
          <div className="relative w-full max-w-5xl h-full max-h-[90vh] overflow-hidden bg-[#fdfbf7] rounded-[2.5rem] shadow-2xl flex flex-col border border-stone-200">
            <div className="flex items-center justify-between p-6 bg-white/80 backdrop-blur-md border-b border-stone-100">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-[#062c1d] rounded-xl p-1 shadow-lg">
                  <Icons.Bot />
                </div>
                <div>
                  <h3 className="font-bold text-[#062c1d] text-xl tracking-tight leading-none">Focus Reader</h3>
                  <p className="text-[10px] uppercase tracking-widest text-stone-400 mt-1 font-bold">QurMa AI Intelligence</p>
                </div>
              </div>
              <button onClick={() => setIsReadingMode(false)} className="p-3 bg-stone-100 hover:bg-red-50 hover:text-red-500 rounded-full transition-all">
                <Icons.Close />
              </button>
            </div>

            <div className="flex-1 p-8 md:p-16 overflow-y-auto diamond-pattern scroll-smooth">
              <div className="max-w-3xl mx-auto">
                {formatText(message.text, true)}
              </div>
            </div>

            <div className="p-6 text-center border-t border-stone-100 bg-white/50 backdrop-blur-sm">
               <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">Layanan Perpustakaan IAI Persis Bandung</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatMessage;
