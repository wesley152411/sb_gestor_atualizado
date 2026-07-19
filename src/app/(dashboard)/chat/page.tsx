'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { sendChatMessage } from '@/services/api';
import { useDecorators, useChatMessages } from '@/hooks/swr-hooks';
import type { Decorator } from '@/types';

export default function ChatPage() {
  const { decorator } = useAuthStore();
  const { decorators } = useDecorators();
  const [activeContact, setActiveContact] = useState<Decorator | null>(null);
  const { messages, mutate: mutateMessages } = useChatMessages(decorator?.id, activeContact?.id);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contacts = decorators.filter(d => d.id !== decorator?.id);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!decorator || !activeContact || !inputValue.trim()) return;
    await sendChatMessage(decorator.id, activeContact.id, inputValue.trim());
    await mutateMessages();
    setInputValue('');

    // Resposta automática simulada
    setTimeout(async () => {
      await sendChatMessage(
        activeContact.id,
        decorator.id,
        'Olá! Esta é uma resposta automática do SB GESTOR. O parceiro foi notificado e responderá em breve.'
      );
      mutateMessages();
    }, 2000);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Chat B2B</h1>
        <p className="text-sm text-slate-400 mt-1">Negocie locações e parcerias com outras decoradoras.</p>
      </div>

      <div className="flex bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden h-[calc(100vh-260px)]">
        {/* Lista de Contatos */}
        <aside className="w-[300px] border-r border-slate-100 flex flex-col shrink-0">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-700">Contatos</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {contacts.map(contact => (
              <div
                key={contact.id}
                className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-all border-l-2 ${
                  activeContact?.id === contact.id
                    ? 'bg-brand-50/50 border-l-brand-500'
                    : 'border-l-transparent hover:bg-slate-50'
                }`}
                onClick={() => setActiveContact(contact)}
              >
                <img
                  src={contact.avatar_url}
                  alt={contact.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{contact.name}</p>
                  <p className="text-xs text-slate-400 truncate">{contact.location || 'Clique para conversar'}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Área de Conversa */}
        <div className="flex-1 flex flex-col">
          {!activeContact ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-base font-semibold text-slate-600 mb-1">Selecione um contato</p>
                <p className="text-sm text-slate-400">Escolha uma decoradora para iniciar a conversa</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header da conversa */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white">
                <img
                  src={activeContact.avatar_url}
                  alt={activeContact.name}
                  className="w-9 h-9 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-bold text-slate-700">{activeContact.name}</p>
                  <p className="text-xs text-slate-400">{activeContact.location}</p>
                </div>
              </div>

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-slate-50/30">
                {messages.map((msg) => {
                  const isMine = msg.sender_id === decorator?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMine
                          ? 'bg-brand-500 text-white rounded-br-md'
                          : 'bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm'
                      }`}>
                        <p>{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${isMine ? 'text-white/60' : 'text-slate-400'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-6 py-4 border-t border-slate-100 bg-white">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim()}
                    className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 disabled:opacity-40 transition-all cursor-pointer active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
