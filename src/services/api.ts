import { getSupabaseClient } from '@/lib/supabase/client';
import {
  initialDecorators, initialInventory, initialChatMessages,
  initialRentalOrders, initialClients, initialPartyEvents, initialKits,
} from '@/lib/mock-data';
import type {
  Decorator, InventoryItem, ChatMessage, RentalOrder,
  Client, PartyEvent, Kit, SignupMetadata, AuthResult, CalendarMonthData,
  PartnerDecorator, PublicMarketplaceItem,
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
  // SEGURANÇA: exigimos Supabase real. Sem sessão de verdade não há como isolar
  // as contas no servidor — não criamos mais "conta" mock em localStorage.
  if (!sb) {
    return { success: false, message: 'Serviço de autenticação indisponível. Tente novamente em instantes.' };
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
    avatar_url: '', // sem foto no cadastro — a decoradora sobe a dela depois
    membership_level: 'Membro',
    location: metadata.location || '',
    instagram: '', whatsapp: '', phone: '', about: '', cover_url: '',
    created_at: new Date().toISOString(),
  };
  return await saveDecoratorProfile(profile);
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabaseClient();
  // SEGURANÇA: só login real do Supabase. Removido o "mock login" que logava
  // qualquer um como decorators[0] (impersonação) e não gerava sessão no servidor.
  if (!sb) {
    return { success: false, message: 'Serviço de autenticação indisponível. Tente novamente em instantes.' };
  }
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      return { success: false, message: error?.message || 'E-mail ou senha inválidos.' };
    }
    return { success: true, user: data.user, session: data.session };
  } catch {
    return { success: false, message: 'Não foi possível conectar. Verifique sua conexão e tente novamente.' };
  }
}

export async function signOut(): Promise<void> {
  // Limpeza de eventuais sessões mock antigas ainda no navegador (legado).
  if (typeof window !== 'undefined') {
    localStorage.removeItem('sbgestor_mock_session');
  }
  const sb = getSupabaseClient();
  if (sb) await sb.auth.signOut();
}

export async function getSession() {
  // SEGURANÇA: só a sessão real do Supabase (nada de mock em localStorage).
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

// ==================== MARKETPLACE B2B (acervo público de parceiras) ====================
//
// Regra de negócio central desta aba:
//   1) somente itens/kits com status "Público";
//   2) EXCLUINDO o acervo da própria decoradora logada.
// A exclusão do usuário logado é passada EXPLICITAMENTE via `currentDecoratorId`,
// para que a futura API real receba esse filtro (ex.: `?excludeDecoratorId=`) e nunca
// devolva o próprio acervo no feed do Marketplace.

function toPartnerDecorator(d?: Decorator): PartnerDecorator {
  return {
    id: d?.id || '',
    name: d?.name || 'Parceira',
    logoUrl: d?.avatar_url || d?.logo_url, // imagem única da conta (avatar); logo = fallback legado
    location: d?.location,
    publicPageId: d?.id || '', // futura página pública da parceira
  };
}

// Busca o acervo PÚBLICO das PARCEIRAS (peças + kits), já com a dona embutida.
// TODO(backend): substituir os getters locais por GET /api/marketplace?excludeDecoratorId=<id>.
export async function fetchPartnerPublicAcervo(
  currentDecoratorId?: string
): Promise<PublicMarketplaceItem[]> {
  const [decorators, items, kits] = await Promise.all([
    getDecorators(),
    getInventoryItems(),
    getKits(),
  ]);

  const ownerById = new Map(decorators.map((d) => [d.id, d]));
  const isPartnerPublic = (status: string, ownerId?: string) =>
    status === 'Público' && ownerId !== currentDecoratorId;

  const publicItems: PublicMarketplaceItem[] = items
    .filter((i) => isPartnerPublic(i.status, i.decorator_id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      imageUrl: i.image_url,
      rentalPrice: i.rental_price,
      availableQuantity: i.stock_quantity,
      isKit: false,
      owner: toPartnerDecorator(ownerById.get(i.decorator_id)),
    }));

  const publicKits: PublicMarketplaceItem[] = kits
    .filter((k) => isPartnerPublic(k.status, k.decorator_id))
    .map((k) => ({
      id: k.id,
      name: k.name,
      description: k.description,
      imageUrl: k.image_url,
      rentalPrice: k.value ?? 0,
      availableQuantity: 1,
      isKit: true,
      kitItemCount: k.items.length,
      owner: toPartnerDecorator(ownerById.get(k.decorator_id)),
    }));

  return [...publicItems, ...publicKits];
}

// Perfil público + acervo público de UMA parceira específica (para a "Ver página").
// Reutiliza a mesma regra (somente "Público") e devolve os itens já unificados.
export async function fetchPartnerPublicPage(
  partnerId: string
): Promise<{ partner: PartnerDecorator; items: PublicMarketplaceItem[] } | null> {
  try {
    const res = await fetch(`/api/public/decorator/${partnerId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data.decorator as Decorator;
    const partner: PartnerDecorator = {
      id: d.id,
      name: d.name,
      logoUrl: d.avatar_url || d.logo_url, // imagem única da conta (avatar); logo = fallback legado
      location: d.location,
      publicPageId: d.id,
    };

    const items: PublicMarketplaceItem[] = [
      ...(data.items as InventoryItem[]).map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        imageUrl: i.image_url,
        rentalPrice: Number(i.rental_price) || 0,
        availableQuantity: i.stock_quantity,
        isKit: false,
        owner: partner,
      })),
      ...(data.kits as Kit[]).map((k) => ({
        id: k.id,
        name: k.name,
        description: k.description,
        imageUrl: k.image_url,
        rentalPrice: Number(k.value) || 0,
        availableQuantity: 1,
        isKit: true,
        kitItemCount: Array.isArray(k.items) ? k.items.length : 0,
        owner: partner,
      })),
    ];

    return { partner, items };
  } catch {
    return null;
  }
}

// Lista de decoradoras PARCEIRAS (todas menos a logada) que têm acervo público,
// já com a contagem de itens públicos de cada uma (para a barra lateral).
export async function fetchPartnerDecoratorsList(
  currentDecoratorId?: string
): Promise<PartnerDecorator[]> {
  const publicAcervo = await fetchPartnerPublicAcervo(currentDecoratorId);
  const byId = new Map<string, PartnerDecorator>();
  for (const item of publicAcervo) {
    const existing = byId.get(item.owner.id);
    if (existing) {
      existing.publicItemCount = (existing.publicItemCount || 0) + 1;
    } else {
      byId.set(item.owner.id, { ...item.owner, publicItemCount: 1 });
    }
  }
  return Array.from(byId.values());
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

export async function getClients(decoratorId?: string): Promise<Client[]> {
  // Sem decoratorId não buscamos no servidor (a rota exige o filtro por dono).
  if (!decoratorId) return getLocal('clients', initialClients).filter((c) => c.decorator_id === undefined);
  try {
    const res = await fetch(`/api/clients?decoratorId=${decoratorId}`);
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  return getLocal('clients', initialClients).filter((c) => c.decorator_id === decoratorId);
}

export async function saveClient(client: Partial<Client>): Promise<Client> {
  const full: Client = {
    id: client.id || generateId('cli'),
    decorator_id: client.decorator_id,
    name: client.name || '',
    phone: client.phone || '',
    email: client.email || '',
    cpf: client.cpf || '',
    address: client.address || '',
  };
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

export async function getPartyEvents(decoratorId?: string): Promise<PartyEvent[]> {
  try {
    const url = decoratorId ? `/api/party-events?decoratorId=${decoratorId}` : '/api/party-events';
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch { /* fallback */ }
  const events = getLocal('party_events', initialPartyEvents);
  return decoratorId ? events.filter((e) => e.decorator_id === decoratorId) : events;
}

export async function savePartyEvent(event: Partial<PartyEvent>): Promise<PartyEvent> {
  const full: PartyEvent = {
    id: event.id || generateId('evt'), client_name: event.client_name || '', phone: event.phone || '',
    address: event.address || '', setup_time: event.setup_time || '', start_time: event.start_time || '',
    theme: event.theme || '', total_value: event.total_value || 0, event_date: event.event_date || '',
    status: event.status || 'Pendente', items: event.items || [], decorator_id: event.decorator_id,
  };

  let res: Response;
  try {
    res = await fetch('/api/party-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(full),
    });
  } catch {
    // Network unreachable — fall back to local demo storage.
    return savePartyEventLocally(full);
  }

  if (res.ok) return await res.json();

  // Server was reached but rejected the write (e.g. a DB constraint violation).
  // Surface this instead of silently discarding it into local storage, since
  // that previously made saves look successful while the event never reached
  // the real database (invisible to the Calendar and any other decorator).
  const errorBody = await res.json().catch(() => ({}));
  console.error('savePartyEvent server error:', res.status, errorBody);
  throw new Error(errorBody.error || `O servidor recusou salvar o evento (erro ${res.status}).`);
}

function savePartyEventLocally(full: PartyEvent): PartyEvent {
  const events = getLocal('party_events', initialPartyEvents);
  const idx = events.findIndex((e) => e.id === full.id);
  if (idx !== -1) events[idx] = { ...events[idx], ...full };
  else events.push(full);
  setLocal('party_events', events);
  return full;
}

// ==================== QUOTE LINKS ====================

export async function createQuoteLink(decoratorId: string, source: { itemId?: string; kitId?: string }): Promise<string> {
  const res = await fetch('/api/quote-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decoratorId, ...source }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível gerar o link de orçamento.');
  }
  const { token } = await res.json();
  return token;
}

// ==================== CALENDAR ====================

export async function getCalendarEvents(decoratorId: string, year: number, month: number): Promise<CalendarMonthData> {
  try {
    const res = await fetch(`/api/calendar?decoratorId=${decoratorId}&year=${year}&month=${month}`);
    if (res.ok) return await res.json();
  } catch { /* fallback */ }

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const isInMonth = (dateStr?: string) => !!dateStr && dateStr.startsWith(monthKey);

  const orders = getLocal('orders', initialRentalOrders).filter(
    (o) => (o.renter_id === decoratorId || o.owner_id === decoratorId) && isInMonth(o.event_date)
  );
  const events = getLocal('party_events', initialPartyEvents).filter(
    (e) => e.decorator_id === decoratorId && isInMonth(e.event_date)
  );
  return { rentalOrders: orders, partyEvents: events };
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
    status: kit.status || 'Privado',
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
