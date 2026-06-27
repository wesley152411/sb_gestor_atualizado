// ==================== DOMAIN TYPES ====================

export interface Decorator {
  id: string;
  name: string;
  avatar_url: string;
  membership_level: string;
  location: string;
  instagram?: string;
  whatsapp?: string;
  phone?: string;
  about?: string;
  cover_url?: string;
  created_at?: string;
  reach?: number;
  contact_rate?: number;
  positive_reviews?: number;
}

export interface InventoryItem {
  id: string;
  decorator_id: string;
  name: string;
  description: string;
  image_url: string;
  status: 'Público' | 'Privado';
  stock_quantity: number;
  rental_price: number;
  internal_cost: number;
}

export interface Kit {
  id: string;
  decorator_id: string;
  name: string;
  description: string;
  image_url: string;
  value: number | null;
  items: KitItem[];
  created_at: string;
}

export interface KitItem {
  id: string;
  name: string;
  quantity: number;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  created_at: string;
}

export interface ForumPost {
  id: string;
  author_id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  replies: ForumReply[];
}

export interface ForumReply {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface RentalOrder {
  id: string;
  renter_id: string;
  owner_id: string;
  item_id?: string;
  event_date?: string;
  observation?: string;
  total_value: number;
  status: string;
  created_at: string;
  items?: RentalOrderItem[];
}

export interface RentalOrderItem {
  name: string;
  quantity: number;
  price: number;
  item?: InventoryItem;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  address: string;
  theme: string;
  total_value: number;
  event_date: string;
}

export interface PartyEventItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface PartyEvent {
  id: string;
  client_name: string;
  phone: string;
  address: string;
  setup_time: string;
  start_time: string;
  theme: string;
  total_value: number;
  event_date: string;
  status: 'Confirmado' | 'Pendente' | 'Finalizado';
  items: PartyEventItem[];
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  isAlert: boolean;
  unread: boolean;
  time: string;
}

// ==================== CART TYPES ====================

export interface CartItem {
  item: InventoryItem;
  quantity: number;
}

// ==================== PARTY FORM TYPES ====================

export interface PartyFormItem {
  item: InventoryItem;
  quantity: number;
}

// ==================== AUTH TYPES ====================

export interface AuthResult {
  success: boolean;
  message?: string;
  needsEmailConfirmation?: boolean;
  user?: unknown;
  session?: unknown;
}

export interface SignupMetadata {
  name: string;
  company_name: string;
  cnpj: string;
  location: string;
}
