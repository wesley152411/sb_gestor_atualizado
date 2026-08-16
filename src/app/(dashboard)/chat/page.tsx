'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, Search, MoreVertical, Smile, Paperclip, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { sendChatMessage } from '@/services/api';
import { useDecorators, useChatMessages } from '@/hooks/swr-hooks';
import { getInitials } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
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

    // O remetente é sempre a sessão (o servidor ignora sender_id do corpo).
    // Removido o "auto-reply" fake: postar em nome do contato agora é bloqueado
    // pelo servidor (ninguém envia mensagem em nome de outra conta).
    await sendChatMessage(decorator.id, activeContact.id, inputValue.trim());
    await mutateMessages();
    setInputValue('');
  };

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header font-bold">Contatos</div>
        <div className="contacts-list">
          {contacts.length === 0 ? (
            <div className="contacts-empty">Nenhum parceiro cadastrado ainda</div>
          ) : (
            contacts.map(contact => (
              <div
                key={contact.id}
                className={`contact-card ${activeContact?.id === contact.id ? 'active' : ''}`}
                onClick={() => setActiveContact(contact)}
              >
                {contact.avatar_url ? (
                  <img src={contact.avatar_url} alt={contact.name} className="contact-avatar" />
                ) : (
                  <div className="contact-avatar contact-avatar-placeholder">{getInitials(contact.name)}</div>
                )}
                <div>
                  <span className="contact-name">{contact.name}</span>
                  <span className="contact-lastmsg">Clique para iniciar a conversa</span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="chat-window">
        {activeContact ? (
          <>
            <div className="chat-window-header">
              {activeContact.avatar_url ? (
                <img src={activeContact.avatar_url} alt={activeContact.name} className="contact-avatar" />
              ) : (
                <div className="contact-avatar contact-avatar-placeholder">{getInitials(activeContact.name)}</div>
              )}
              <div className="chat-header-info">
                <h3 className="chat-header-name">{activeContact.name}</h3>
                <span className="chat-header-status"><span className="chat-status-dot" />Online</span>
              </div>
              <div className="chat-header-actions">
                <button type="button" className="chat-header-icon" aria-label="Buscar">
                  <Search className="w-5 h-5" />
                </button>
                <button type="button" className="chat-header-icon" aria-label="Mais opções">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="chat-messages">
              <div className="chat-day-divider"><span>HOJE</span></div>
              <div className="chat-encryption-note">
                As mensagens são protegidas por criptografia de ponta a ponta.
              </div>
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <MessageSquare className="chat-empty-icon" />
                  <span>Nenhuma mensagem ainda</span>
                </div>
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
              <button type="button" className="chat-input-icon" aria-label="Emoji">
                <Smile className="w-5 h-5" />
              </button>
              <button type="button" className="chat-input-icon" aria-label="Anexar">
                <Paperclip className="w-5 h-5" />
              </button>
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
