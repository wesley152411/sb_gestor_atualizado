import useSWR, { mutate } from 'swr';
import type { Decorator, InventoryItem, RentalOrder, ChatMessage, Client, PartyEvent, Kit } from '@/types';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Erro ao carregar dados');
  }
  return res.json();
};

export function useDecorators() {
  const { data, error, isLoading, mutate: revalidate } = useSWR<Decorator[]>('/api/decorators', fetcher);
  return {
    decorators: data || [],
    error,
    isLoading,
    mutate: revalidate,
  };
}

export function useInventory(decoratorId?: string) {
  const url = decoratorId ? `/api/inventory?decoratorId=${decoratorId}` : '/api/inventory';
  const { data, error, isLoading, mutate: revalidate } = useSWR<InventoryItem[]>(url, fetcher);
  return {
    items: data || [],
    error,
    isLoading,
    mutate: revalidate,
  };
}

export function useRentalOrders(decoratorId?: string) {
  const url = decoratorId ? `/api/orders?decoratorId=${decoratorId}` : null;
  const { data, error, isLoading, mutate: revalidate } = useSWR<RentalOrder[]>(url, fetcher);
  return {
    orders: data || [],
    error,
    isLoading,
    mutate: revalidate,
  };
}

export function useChatMessages(decoratorA?: string, decoratorB?: string) {
  const url = decoratorA && decoratorB ? `/api/chats?decoratorA=${decoratorA}&decoratorB=${decoratorB}` : null;
  const { data, error, isLoading, mutate: revalidate } = useSWR<ChatMessage[]>(url, fetcher);
  return {
    messages: data || [],
    error,
    isLoading,
    mutate: revalidate,
  };
}

export function useDecoratorChats(decoratorId?: string) {
  const url = decoratorId ? `/api/chats?decoratorId=${decoratorId}` : null;
  const { data, error, isLoading, mutate: revalidate } = useSWR<ChatMessage[]>(url, fetcher);
  return {
    chats: data || [],
    error,
    isLoading,
    mutate: revalidate,
  };
}

export function useClients() {
  const { data, error, isLoading, mutate: revalidate } = useSWR<Client[]>('/api/clients', fetcher);
  return {
    clients: data || [],
    error,
    isLoading,
    mutate: revalidate,
  };
}

export function usePartyEvents() {
  const { data, error, isLoading, mutate: revalidate } = useSWR<PartyEvent[]>('/api/party-events', fetcher);
  return {
    events: data || [],
    error,
    isLoading,
    mutate: revalidate,
  };
}

export function useKits(decoratorId?: string) {
  const url = decoratorId ? `/api/kits?decoratorId=${decoratorId}` : '/api/kits';
  const { data, error, isLoading, mutate: revalidate } = useSWR<Kit[]>(url, fetcher);
  return {
    kits: data || [],
    error,
    isLoading,
    mutate: revalidate,
  };
}

// Global mutations trigger helper to revalidate cached pages when updates happen
export function triggerRevalidate(urlPattern: string) {
  mutate(urlPattern);
}
