import type { Decorator, InventoryItem, ChatMessage, RentalOrder, Client, PartyEvent, Kit } from '@/types';

export const initialDecorators: Decorator[] = [
  {
    id: 'dec-1',
    name: 'Elite Decorations',
    avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&q=80',
    membership_level: 'Pro Member',
    location: 'São Paulo - Zona Sul, SP',
    reach: 264,
    contact_rate: 33.3,
    positive_reviews: 9,
  },
  {
    id: 'dec-2',
    name: 'Bella Festa Co.',
    avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&q=80',
    membership_level: 'Membro Premium',
    location: 'Campinas, SP',
    reach: 520,
    contact_rate: 45.5,
    positive_reviews: 15,
  },
  {
    id: 'dec-3',
    name: 'Luxo & Brilho Decor',
    avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop&q=80',
    membership_level: 'Membro Standard',
    location: 'Santo André, SP',
    reach: 180,
    contact_rate: 25.0,
    positive_reviews: 6,
  },
];

export const initialInventory: InventoryItem[] = [
  {
    id: 'inv-1', decorator_id: 'dec-1', name: 'Cadeira Dior Dourada Resina',
    description: 'Cadeira elegante estilo Dior em resina dourada de alta resistência. Ideal para casamentos e jantares de gala.',
    image_url: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=400&q=80',
    status: 'Público', stock_quantity: 240, rental_price: 15.00, internal_cost: 85.00,
  },
  {
    id: 'inv-2', decorator_id: 'dec-1', name: 'Mesa Rústica Família 3m',
    description: 'Mesa retangular em madeira maciça de demolição com 3 metros.',
    image_url: 'https://images.unsplash.com/photo-1530018607912-eff2df114fbe?w=400&q=80',
    status: 'Privado', stock_quantity: 12, rental_price: 180.00, internal_cost: 1200.00,
  },
  {
    id: 'inv-3', decorator_id: 'dec-1', name: 'Vaso Murano Prata 40cm',
    description: 'Vaso decorativo em vidro murano trabalhado com pó de prata.',
    image_url: 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=400&q=80',
    status: 'Público', stock_quantity: 48, rental_price: 35.00, internal_cost: 210.00,
  },
  {
    id: 'inv-4', decorator_id: 'dec-1', name: 'Painel Redondo Dourado Metálico',
    description: 'Estrutura desmontável de painel redondo com acabamento dourado, 2m de diâmetro.',
    image_url: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&q=80',
    status: 'Privado', stock_quantity: 5, rental_price: 90.00, internal_cost: 350.00,
  },
  {
    id: 'inv-5', decorator_id: 'dec-2', name: 'Sofá Chesterfield Couro Caramelo',
    description: 'Sofá clássico Chesterfield em couro legítimo caramelo, 3 lugares.',
    image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80',
    status: 'Público', stock_quantity: 3, rental_price: 450.00, internal_cost: 3200.00,
  },
  {
    id: 'inv-6', decorator_id: 'dec-2', name: 'Lustre de Cristal Imperial 12 Braços',
    description: 'Lustre clássico de cristal K9, com 12 braços e lâmpadas vela LED.',
    image_url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80',
    status: 'Público', stock_quantity: 8, rental_price: 250.00, internal_cost: 1500.00,
  },
  {
    id: 'inv-7', decorator_id: 'dec-2', name: 'Mesa Lateral Provençal Off-White',
    description: 'Mesa lateral com acabamento provençal desgastado em laca off-white.',
    image_url: 'https://images.unsplash.com/photo-1532372320978-9b4d8a3a0245?w=400&q=80',
    status: 'Público', stock_quantity: 15, rental_price: 40.00, internal_cost: 180.00,
  },
  {
    id: 'inv-8', decorator_id: 'dec-3', name: 'Arco de Flores Boho Chic',
    description: 'Arco hexagonal de madeira com flores desidratadas e capim dos pampas.',
    image_url: 'https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?w=400&q=80',
    status: 'Público', stock_quantity: 2, rental_price: 380.00, internal_cost: 1900.00,
  },
  {
    id: 'inv-9', decorator_id: 'dec-3', name: 'Tapete Persa Vintage 3x4m',
    description: 'Tapete persa autêntico com estampa clássica em tons de terracota.',
    image_url: 'https://images.unsplash.com/photo-1576016770956-debb63d900ee?w=400&q=80',
    status: 'Público', stock_quantity: 4, rental_price: 220.00, internal_cost: 1800.00,
  },
];

export const initialChatMessages: ChatMessage[] = [
  { id: 'msg-1', sender_id: 'dec-2', receiver_id: 'dec-1', message: 'Olá! Vi que vocês têm 240 Cadeiras Dior Douradas. Vocês teriam 80 unidades para o dia 14/06?', created_at: '2026-06-03T14:32:00Z' },
  { id: 'msg-2', sender_id: 'dec-1', receiver_id: 'dec-2', message: 'Olá, Bella! Sim, temos sim! Essa data está livre. Deseja reservar?', created_at: '2026-06-03T14:40:00Z' },
  { id: 'msg-3', sender_id: 'dec-2', receiver_id: 'dec-1', message: 'Excelente! Vou confirmar e já gero o pedido. Obrigada!', created_at: '2026-06-03T15:01:00Z' },
  { id: 'msg-4', sender_id: 'dec-3', receiver_id: 'dec-1', message: 'Olá Elite! Vocês alugam o Painel Redondo Dourado?', created_at: '2026-06-02T10:15:00Z' },
  { id: 'msg-5', sender_id: 'dec-1', receiver_id: 'dec-3', message: 'Aquele painel é de controle interno, mas dependendo da data, podemos abrir exceção!', created_at: '2026-06-02T10:30:00Z' },
];

export const initialRentalOrders: RentalOrder[] = [
  {
    id: 'ord-1', renter_id: 'dec-2', owner_id: 'dec-1', total_value: 1200.00,
    status: 'Confirmado', created_at: '2026-06-01T11:00:00Z',
    items: [{ name: 'Cadeira Dior Dourada Resina', quantity: 80, price: 15.00 }],
  },
];

export const initialClients: Client[] = [
  { id: 'cli-1', name: 'Mariana Silva', phone: '11988887777', address: 'Av. Paulista, 1000 - São Paulo, SP', theme: 'Casamento Clássico', total_value: 4500.00, event_date: '2026-06-15' },
  { id: 'cli-2', name: 'Juliana Souza', phone: '11977776666', address: 'Rua Augusta, 500 - São Paulo, SP', theme: 'Festa Infantil Bosque', total_value: 2800.00, event_date: '2026-06-15' },
];

export const initialPartyEvents: PartyEvent[] = [
  {
    id: 'evt-1', client_name: 'Mariana Silva', phone: '11988887777', address: 'Av. Paulista, 1000 - São Paulo, SP',
    setup_time: '08:00', start_time: '12:00', theme: 'Casamento Clássico', total_value: 4500.00, event_date: '2026-06-15',
    status: 'Confirmado', items: [{ id: 'inv-1', name: 'Cadeira Dior Dourada Resina', quantity: 180, price: 15.00 }],
  },
  {
    id: 'evt-2', client_name: 'Juliana Souza', phone: '11977776666', address: 'Rua Augusta, 500 - São Paulo, SP',
    setup_time: '10:00', start_time: '15:00', theme: 'Festa Infantil Bosque', total_value: 2800.00, event_date: '2026-06-15',
    status: 'Pendente', items: [{ id: 'inv-1', name: 'Cadeira Dior Dourada Resina', quantity: 100, price: 15.00 }],
  },
];

export const initialKits: Kit[] = [
  {
    id: 'kit-1', decorator_id: 'dec-1', name: 'Kit Seleção Brasileira',
    description: 'Decoração completa com tema futebol Brasil. Painéis, mesas, letreiros e balões.',
    image_url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600&q=80',
    value: null,
    items: [
      { id: 'inv-1', name: 'Cadeira Dior Dourada Resina', quantity: 50 },
      { id: 'inv-2', name: 'Mesa Rústica Família 3m', quantity: 5 },
      { id: 'inv-3', name: 'Vaso Murano Prata 40cm', quantity: 10 },
      { id: 'inv-4', name: 'Painel Redondo Dourado Metálico', quantity: 2 },
    ],
    created_at: '2026-05-10T09:00:00Z',
  },
  {
    id: 'kit-2', decorator_id: 'dec-1', name: 'Kit Princesa Encantada',
    description: 'Decoração mágica para festas infantis em tons rose e dourado.',
    image_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=80',
    value: null,
    items: [
      { id: 'inv-1', name: 'Cadeira Dior Dourada Resina', quantity: 30 },
      { id: 'inv-3', name: 'Vaso Murano Prata 40cm', quantity: 8 },
      { id: 'inv-4', name: 'Painel Redondo Dourado Metálico', quantity: 1 },
    ],
    created_at: '2026-05-15T10:00:00Z',
  },
];
