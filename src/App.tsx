import { useState, useRef, useEffect } from "react";
import { Mic, Send, StopCircle, User, Bot, Volume2, Loader2, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { chatWithGemini } from "./services/geminiService";
import type { Content } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChatMessage {
  role: "user" | "model";
  text: string;
  audioUrl?: string;
  isAudio?: boolean;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Handle Text Submission
  const handleSendText = async () => {
    if (!input.trim() || isLoading) return;
    
    const userText = input.trim();
    setInput("");
    await processMessage(userText);
  };

  // Handle Voice Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const base64Audio = await blobToBase64(audioBlob);
        await processMessage({ data: base64Audio, mimeType: "audio/webm" });
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const processMessage = async (userInput: string | { data: string; mimeType: string }) => {
    setIsLoading(true);
    setError(null);

    // Add user message to UI
    const isAudio = typeof userInput !== "string";
    const newUserMessage: ChatMessage = {
      role: "user",
      text: isAudio ? "Voice message" : userInput as string,
      isAudio,
    };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      // Convert messages to Gemini history format
      const history: Content[] = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      const result = await chatWithGemini(history, userInput);

      // Add model response to UI
      const modelMessage: ChatMessage = {
        role: "model",
        text: result.text,
        audioUrl: result.audioBase64 ? `data:audio/mp3;base64,${result.audioBase64}` : undefined,
      };
      
      setMessages(prev => [...prev, modelMessage]);

      // Play audio if available
      if (result.audioBase64) {
        playAudio(`data:audio/mp3;base64,${result.audioBase64}`);
      }
    } catch (err) {
      console.error("Error processing message:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = (url: string) => {
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Bot className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">EchoMind</h1>
            <p className="text-xs text-emerald-500/70 font-mono uppercase tracking-widest">Voice-First AI</p>
          </div>
        </div>
        <button 
          onClick={clearChat}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-white/80"
          title="Clear Chat"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto px-4 py-8 space-y-6 scrollbar-hide">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full pt-20 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Mic className="w-10 h-10 text-white/20" />
              </div>
              <h2 className="text-2xl font-light text-white/60">How can I help you today?</h2>
              <p className="text-sm text-white/40 max-w-xs">Try speaking to me or typing your message below.</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "flex gap-4 group",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1",
                  msg.role === "user" ? "bg-white/10" : "bg-emerald-500/10"
                )}>
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-emerald-500" />}
                </div>
                <div className={cn(
                  "max-w-[80%] space-y-2",
                  msg.role === "user" ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                    msg.role === "user" 
                      ? "bg-white/5 text-white/90 rounded-tr-none border border-white/5" 
                      : "bg-emerald-500/5 text-emerald-50/90 rounded-tl-none border border-emerald-500/10"
                  )}>
                    {msg.isAudio ? (
                      <div className="flex items-center gap-2 italic text-white/60">
                        <Mic className="w-3 h-3" />
                        Voice input
                      </div>
                    ) : (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  {msg.audioUrl && (
                    <button 
                      onClick={() => playAudio(msg.audioUrl!)}
                      className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-emerald-500/60 hover:text-emerald-500 transition-colors px-1"
                    >
                      <Volume2 className="w-3 h-3" />
                      Play Response
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="bg-emerald-500/5 px-4 py-3 rounded-2xl rounded-tl-none border border-emerald-500/10">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              </div>
            </motion.div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
              {error}
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="p-6 bg-black/40 backdrop-blur-xl border-t border-white/10">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="flex-1 relative group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendText()}
              placeholder={isRecording ? "Listening..." : "Type a message..."}
              disabled={isRecording || isLoading}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-14 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all disabled:opacity-50 placeholder:text-white/20"
            />
            <button
              onClick={handleSendText}
              disabled={!input.trim() || isLoading || isRecording}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isLoading}
                className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all group disabled:opacity-50"
                title="Voice Input"
              >
                <Mic className="w-6 h-6 text-white/60 group-hover:text-emerald-500 transition-colors" />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="p-4 rounded-2xl bg-red-500/20 border border-red-500/30 animate-pulse transition-all group"
                title="Stop Recording"
              >
                <StopCircle className="w-6 h-6 text-red-500" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-center mt-4 text-white/20 uppercase tracking-[0.2em] font-medium">
          Powered by Gemini AI • Text & Audio Enabled
        </p>
      </footer>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
