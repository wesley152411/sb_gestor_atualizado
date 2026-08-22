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
  logo_url?: string;
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
  status: 'Público' | 'Privado';
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
  owner?: RentalOrderContact;
  renter?: RentalOrderContact;
}

export interface RentalOrderContact {
  id: string;
  name: string;
  phone?: string;
}

export interface RentalOrderItem {
  name: string;
  quantity: number;
  price: number;
  item_id?: string;
  kit_id?: string;
  item?: InventoryItem;
}

export interface Client {
  id: string;
  decorator_id?: string;
  name: string;
  phone?: string;
  email?: string;
  cpf?: string;
  address?: string;
  created_at?: string;
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
  decorator_id?: string;
  client_id?: string;
  public_token?: string;
  source_item_id?: string;
  source_kit_id?: string;
  observation?: string;
  created_at?: string;
}

// Dados públicos de um card (peça/kit) de origem, exibidos na página do link de orçamento.
export interface QuoteSourceCard {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  price: number;
  isKit: boolean;
  items?: PartyEventItem[];
}

export interface QuoteLinkData {
  token: string;
  status: 'Confirmado' | 'Pendente' | 'Finalizado';
  decorator: { name: string; whatsapp?: string };
  card: QuoteSourceCard;
  client_name: string;
  phone: string;
  email?: string;
  cpf?: string;
  address: string;
  event_date: string;
  setup_time: string;
  start_time: string;
  observation?: string;
}

export interface CalendarMonthData {
  rentalOrders: RentalOrder[];
  partyEvents: PartyEvent[];
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  isAlert: boolean;
  unread: boolean;
  time: string;
}

// ==================== MARKETPLACE B2B TYPES ====================
// Regra de negócio: o Marketplace exibe EXCLUSIVAMENTE o acervo público de
// OUTRAS decoradoras (parceiras). O acervo da decoradora logada nunca aparece aqui.

// Dados públicos da decoradora DONA da peça — usados no card e para o "Ver página"
// saber exatamente para qual perfil público redirecionar.
export interface PartnerDecorator {
  id: string;
  name: string;
  logoUrl?: string;
  location?: string;
  about?: string;       // texto de apresentação (público)
  whatsapp?: string;    // dígitos (DDI/DDD) — vira link wa.me na página pública
  instagram?: string;   // handle (com ou sem @) — vira link na página pública
  publicPageId: string; // ID/slug da página pública (destino do botão "Ver página")
  publicItemCount?: number; // qtd de itens públicos que a parceira tem no feed
}

// Item público (peça avulsa ou kit) de uma parceira, já com a dona embutida.
export interface PublicMarketplaceItem {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  rentalPrice: number; // valor de locação B2B
  availableQuantity: number;
  isKit: boolean;
  kitItemCount?: number; // nº de itens quando for kit
  owner: PartnerDecorator; // decoradora dona (para o card e "Ver página")
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
