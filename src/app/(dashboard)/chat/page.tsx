'use client';

import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { sendChatMessage } from '@/services/api';
import { useDecorators, useChatMessages } from '@/hooks/swr-hooks';
import { Button } from '@/components/ui/Button';
import type { Decorator, ChatMessage } from '@/types';

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

    // Simulate auto-reply (Legacy behavior kept for now as per instructions)
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
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header font-bold">Contatos</div>
        <div className="contacts-list">
          {contacts.map(contact => (
            <div 
              key={contact.id} 
              className={`contact-card ${activeContact?.id === contact.id ? 'active' : ''}`}
              onClick={() => setActiveContact(contact)}
            >
              <img src={contact.avatar_url} alt={contact.name} className="contact-avatar" />
              <div>
                <span className="contact-name">{contact.name}</span>
                <span className="contact-lastmsg">Clique para iniciar a conversa</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="chat-window">
        {activeContact ? (
          <>
            <div className="chat-window-header">
              <img src={activeContact.avatar_url} alt={activeContact.name} className="w-10 h-10 rounded-full object-cover" />
              <div>
                <h3 className="font-bold">{activeContact.name}</h3>
                <span className="text-xs text-slate-500">Online</span>
              </div>
            </div>
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="text-center text-slate-500 mt-10">Inicie a conversa com {activeContact.name}.</div>
              ) : (
                messages.map(msg => {
                  const isSent = msg.sender_id === decorator?.id;
                  return (
                    <div key={msg.id} className={`message-wrapper ${isSent ? 'sent' : 'received'}`}>
                      <div className="message-bubble">{msg.message}</div>
                      <span className="message-time">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-input-area">
              <input 
                type="text" 
                placeholder="Digite sua mensagem..." 
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              />
              <Button icon={Send} size="icon" onClick={handleSendMessage} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <span className="text-4xl mb-4 opacity-50">💬</span>
            <p>Selecione um contato para conversar</p>
          </div>
        )}
      </main>
    </div>
  );
}
