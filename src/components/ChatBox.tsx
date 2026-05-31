/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare } from 'lucide-react';

interface ChatMessage {
  sender: string;
  text: string;
  time: string;
}

interface ChatBoxProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isConnected: boolean;
}

export default function ChatBox({ messages, onSendMessage, isConnected }: ChatBoxProps) {
  const [typedMessage, setTypedMessage] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || !isConnected) return;
    onSendMessage(typedMessage);
    setTypedMessage('');
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[280px] bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
      <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 flex items-center gap-1.5">
        <MessageSquare size={13} className="text-emerald-400" />
        <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
          Room Chat
        </span>
      </div>

      {/* Messages */}
      <div
        ref={chatScrollRef}
        className="flex-1 p-3 overflow-y-auto space-y-2 text-xs font-sans"
      >
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 my-8 py-4">
            No messages yet. Send a greeting to start chatting!
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isSystem = msg.sender === 'System';
            return (
              <div
                key={idx}
                className={`p-2 rounded-xl max-w-[90%] ${
                  isSystem
                    ? 'bg-slate-950/40 text-slate-400 text-[11px] border-l-2 border-emerald-500/60 italic'
                    : 'bg-slate-800/40 text-slate-100 border border-slate-800/40'
                }`}
              >
                {!isSystem && (
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-bold text-emerald-400 truncate max-w-[120px]">
                      {msg.sender}
                    </span>
                    <span className="text-[9px] text-slate-550 font-mono">
                      {msg.time}
                    </span>
                  </div>
                )}
                <p className="break-all whitespace-pre-wrap">{msg.text}</p>
              </div>
            );
          })
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="p-2 bg-slate-900/40 border-t border-slate-800 flex items-center gap-1.5"
      >
        <input
          type="text"
          value={typedMessage}
          onChange={(e) => setTypedMessage(e.target.value)}
          disabled={!isConnected}
          placeholder={isConnected ? "Type a message..." : "Disconnected from room..."}
          className="flex-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-850 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!typedMessage.trim() || !isConnected}
          className="p-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg text-white transition-colors duration-200 shadow-md cursor-pointer"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}
