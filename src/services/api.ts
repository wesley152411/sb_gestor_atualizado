import { getSupabaseClient } from '@/lib/supabase/client';
import {
  initialDecorators, initialInventory, initialChatMessages,
  initialRentalOrders, initialClients, initialPartyEvents, initialKits,
} from '@/lib/mock-data';
import type {
  Decorator, InventoryItem, ChatMessage, RentalOrder,
  Client, PartyEvent, Kit, SignupMetadata, AuthResult,
} from '@/types';
import { generateId } from '@/lib/utils';

// ==================== LOCAL STORAGE HELPERS ====================

function getLocal<T>(key: string, defaultData: T): T {
  if (typeof window === 'undefined') return defaultData;
  const data = localStorage.getItem(`sbgestor_${key}`);
  if (!data) {
    localStorage.setItem(`sbgestor_${key}`, JSON.stringify(defaultData));
    return defaultData;
  }
  return JSON.parse(data) as T;
}

function setLocal<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`sbgestor_${key}`, JSON.stringify(data));
}

// ==================== AUTH ====================

export async function signUp(email: string, password: string, metadata: SignupMetadata): Promise<AuthResult> {
  const sb = getSupabaseClient();
  if (!sb) {
    const newDecorator: Decorator = {
      id: generateId('dec'),
      name: metadata.company_name || metadata.name || 'Decoradora',
      avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&q=80',
      membership_level: 'Membro',
      location: metadata.location || '',
      instagram: '', whatsapp: '', phone: '', about: '', cover_url: '',
      created_at: new Date().toISOString(),
    };
    const decorators = getLocal('decorators', initialDecorators);
    decorators.push(newDecorator);
    setLocal('decorators', decorators);

    if (typeof window !== 'undefined') {
      localStorage.setItem('sbgestor_mock_session', JSON.stringify({ user: { id: newDecorator.id, email } }));
    }
    return { success: true, needsEmailConfirmation: false, user: { id: newDecorator.id, email }, session: { user: { id: newDecorator.id, email } } };
  }
  try {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name: metadata.name, company_name: metadata.company_name, location: metadata.location, cnpj: metadata.cnpj } },
    });
    if (error) {
      if (error.message.includes('already registered')) return { success: false, message: 'Este e-mail já está cadastrado.' };
      return { success: false, message: error.message };
    }
    if (data.user && !data.session) {
      await createDecoratorFromAuth(data.user.id, metadata);
      return { success: true, needsEmailConfirmation: true, message: 'Conta criada! Verifique seu e-mail para confirmar.', user: data.user };
    }
    if (data.user && data.session) {
      await createDecoratorFromAuth(data.user.id, metadata);
      return { success: true, needsEmailConfirmation: false, user: data.user, session: data.session };
    }
    return { success: false, message: 'Erro desconhecido ao criar conta.' };
  } catch {
    return { success: false, message: 'Erro interno ao criar conta.' };
  }
}

async function createDecoratorFromAuth(userId: string, metadata: SignupMetadata) {
  const profile: Decorator = {
    id: userId,
    name: metadata.company_name || metadata.name || 'Decoradora',
    avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&q=80',
    membership_level: 'Membro',
    location: metadata.location || '',
    instagram: '', whatsapp: '', phone: '', about: '', cover_url: '',
    created_at: new Date().toISOString(),
  };
  return await saveDecoratorProfile(profile);
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabaseClient();
  if (sb) {
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data?.session) {
        return { success: true, user: data.user, session: data.session };
      }
    } catch {
      // Fallback below
    }
  }

  // Fallback / Mock Login
  const decorators = getLocal('decorators', initialDecorators);
  const decorator = decorators[0] || {
    id: 'dec-1',
    name: 'Elite Decorations',
    avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&q=80',
    membership_level: 'Pro Member',
    location: 'São Paulo - Zona Sul, SP',
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem('sbgestor_mock_session', JSON.stringify({ user: { id: decorator.id, email } }));
  }

  return { success: true, user: { id: decorator.id, email }, session: { user: { id: decorator.id, email } } };
}

export async function signOut(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('sbgestor_mock_session');
  }
  const sb = getSupabaseClient();
  if (sb) await sb.auth.signOut();
}

export async function getSession() {
  if (typeof window !== 'undefined') {
    const mockSession = localStorage.getItem('sbgestor_mock_session');
    if (mockSession) {
      return JSON.parse(mockSession);
    }
  }
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getSession();
    if (error || !data.session) return null;
    return data.session;
  } catch { return null; }
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const sb = getSupabaseClient();
  if (!sb) return { success: false, message: 'Erro ao conectar com o servidor.' };
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'E-mail de recuperação enviado!' };
  } catch { return { success: false, message: 'Erro ao enviar e-mail de recuperação.' }; }
}

export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = sb.auth.onAuthStateChange((event: string, session: unknown) => callback(event, session));
  return data?.subscription;
}

// ==================== DECORATORS ====================

export async function getDecorators(): Promise<Decorator[]> {
  try {
    const res = await fetch('/api/decorators');
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  return getLocal('decorators', initialDecorators);
}

export async function saveDecoratorProfile(profile: Decorator): Promise<Decorator> {
  try {
    const res = await fetch('/api/decorators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const decorators = getLocal('decorators', initialDecorators);
  const idx = decorators.findIndex((d) => d.id === profile.id);
  if (idx !== -1) decorators[idx] = { ...decorators[idx], ...profile };
  else decorators.push(profile);
  setLocal('decorators', decorators);
  return profile;
}

// ==================== INVENTORY ====================

export async function getInventoryItems(decoratorId?: string): Promise<InventoryItem[]> {
  try {
    const url = decoratorId ? `/api/inventory?decoratorId=${decoratorId}` : '/api/inventory';
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const items = getLocal('inventory', initialInventory);
  return decoratorId ? items.filter((i) => i.decorator_id === decoratorId) : items;
}

export async function saveInventoryItem(item: InventoryItem): Promise<InventoryItem> {
  if (!item.id) item.id = generateId('inv');
  try {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const items = getLocal('inventory', initialInventory);
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx !== -1) items[idx] = { ...items[idx], ...item };
  else items.push(item);
  setLocal('inventory', items);
  return item;
}

export async function deleteInventoryItem(itemId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/inventory/${itemId}`, { method: 'DELETE' });
    if (res.ok) return true;
  } catch { /* fallback */ }
  const items = getLocal('inventory', initialInventory);
  setLocal('inventory', items.filter((i) => i.id !== itemId));
  return true;
}

// ==================== CHAT ====================

export async function getChatMessages(decoratorA: string, decoratorB: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`/api/chats?decoratorA=${decoratorA}&decoratorB=${decoratorB}`);
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const messages = getLocal('chats', initialChatMessages);
  return messages.filter((m) =>
    (m.sender_id === decoratorA && m.receiver_id === decoratorB) ||
    (m.sender_id === decoratorB && m.receiver_id === decoratorA)
  ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function getDecoratorChatMessages(decoratorId: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`/api/chats?decoratorId=${decoratorId}`);
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const messages = getLocal('chats', initialChatMessages);
  return messages.filter((m) => m.sender_id === decoratorId || m.receiver_id === decoratorId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function sendChatMessage(senderId: string, receiverId: string, messageText: string): Promise<ChatMessage> {
  const newMsg: ChatMessage = { id: generateId('msg'), sender_id: senderId, receiver_id: receiverId, message: messageText, created_at: new Date().toISOString() };
  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMsg),
    });
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const messages = getLocal('chats', initialChatMessages);
  messages.push(newMsg);
  setLocal('chats', messages);
  return newMsg;
}

// ==================== RENTAL ORDERS ====================

export async function getRentalOrders(decoratorId: string): Promise<RentalOrder[]> {
  try {
    const res = await fetch(`/api/orders?decoratorId=${decoratorId}`);
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const orders = getLocal('orders', initialRentalOrders);
  return orders.filter((o) => o.renter_id === decoratorId || o.owner_id === decoratorId);
}

export async function saveRentalOrder(order: Partial<RentalOrder>): Promise<RentalOrder> {
  const newOrder: RentalOrder = {
    id: generateId('ord'),
    renter_id: order.renter_id || '',
    owner_id: order.owner_id || '',
    item_id: order.item_id,
    event_date: order.event_date,
    observation: order.observation,
    total_value: order.total_value || 0,
    status: 'Pendente',
    created_at: new Date().toISOString(),
    items: order.items,
  };
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder),
    });
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const orders = getLocal('orders', initialRentalOrders);
  orders.unshift(newOrder);
  setLocal('orders', orders);
  return newOrder;
}

// ==================== CLIENTS ====================

export async function getClients(): Promise<Client[]> {
  try {
    const res = await fetch('/api/clients');
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  return getLocal('clients', initialClients);
}

export async function saveClient(client: Partial<Client>): Promise<Client> {
  const full: Client = { id: client.id || generateId('cli'), name: client.name || '', phone: client.phone || '', address: client.address || '', theme: client.theme || '', total_value: client.total_value || 0, event_date: client.event_date || '' };
  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
    });
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const clients = getLocal('clients', initialClients);
  const idx = clients.findIndex((c) => c.id === full.id);
  if (idx !== -1) clients[idx] = { ...clients[idx], ...full };
  else clients.push(full);
  setLocal('clients', clients);
  return full;
}

// ==================== PARTY EVENTS ====================

export async function getPartyEvents(): Promise<PartyEvent[]> {
  try {
    const res = await fetch('/api/party-events');
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  return getLocal('party_events', initialPartyEvents);
}

export async function savePartyEvent(event: Partial<PartyEvent>): Promise<PartyEvent> {
  const full: PartyEvent = {
    id: event.id || generateId('evt'), client_name: event.client_name || '', phone: event.phone || '',
    address: event.address || '', setup_time: event.setup_time || '', start_time: event.start_time || '',
    theme: event.theme || '', total_value: event.total_value || 0, event_date: event.event_date || '',
    status: event.status || 'Pendente', items: event.items || [],
  };
  try {
    const res = await fetch('/api/party-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
    });
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const events = getLocal('party_events', initialPartyEvents);
  const idx = events.findIndex((e) => e.id === full.id);
  if (idx !== -1) events[idx] = { ...events[idx], ...full };
  else events.push(full);
  setLocal('party_events', events);
  return full;
}

// ==================== KITS ====================

export async function getKits(decoratorId?: string): Promise<Kit[]> {
  try {
    const url = decoratorId ? `/api/kits?decoratorId=${decoratorId}` : '/api/kits';
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const kits = getLocal('kits', initialKits);
  return decoratorId ? kits.filter((k) => k.decorator_id === decoratorId) : kits;
}

export async function saveKit(kit: Partial<Kit>): Promise<Kit> {
  const full: Kit = {
    id: kit.id || generateId('kit'), decorator_id: kit.decorator_id || '',
    name: kit.name || '', description: kit.description || '', image_url: kit.image_url || '',
    value: kit.value ?? null, items: kit.items || [], created_at: kit.created_at || new Date().toISOString(),
  };
  try {
    const res = await fetch('/api/kits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
    });
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const kits = getLocal('kits', initialKits);
  const idx = kits.findIndex((k) => k.id === full.id);
  if (idx !== -1) kits[idx] = { ...kits[idx], ...full };
  else kits.push(full);
  setLocal('kits', kits);
  return full;
}

export async function deleteKit(kitId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/kits/${kitId}`, { method: 'DELETE' });
    if (res.ok) return true;
  } catch { /* fallback */ }
  const kits = getLocal('kits', initialKits);
  setLocal('kits', kits.filter((k) => k.id !== kitId));
  return true;
}

// ==================== SUPABASE STORAGE (Image Upload) ====================

export async function uploadImage(file: File, bucket: string, path: string): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  } catch (e) {
    console.error('Upload error:', e);
    return null;
  }
}
