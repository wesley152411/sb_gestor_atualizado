// Motor de disponibilidade da locação B2B — a AUTORIDADE FINAL é o servidor.
// Disponível(peça, período) = stock_quantity − reservado, onde reservado é a soma
// das quantidades da peça em locações ATIVAS cujo [pickup,return] SOBREPÕE o período.
// Kits expandem nos componentes (KitItem = { id(=item), quantity }).
import type { Prisma } from '@prisma/client';

export type OrderLine = { item_id?: string | null; kit_id?: string | null; quantity: number };
type KitComponent = { id: string; quantity: number };

// Datas @db.Date: comparo em meia-noite UTC para não escorregar de fuso.
function d(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T00:00:00Z`);
}

// Expande linhas do pedido (item ou kit) em demanda por peça de inventário.
export function expandToItemDemand(lines: OrderLine[], kitComponentsById: Map<string, KitComponent[]>): Map<string, number> {
  const demand = new Map<string, number>();
  const add = (id: string, q: number) => demand.set(id, (demand.get(id) || 0) + q);
  for (const l of lines) {
    const qty = Number(l.quantity) || 0;
    if (l.item_id) add(l.item_id, qty);
    else if (l.kit_id) for (const c of kitComponentsById.get(l.kit_id) || []) add(c.id, (Number(c.quantity) || 0) * qty);
  }
  return demand;
}

// Lê a composição dos kits (JSON items) num Map<kitId, KitComponent[]>.
export async function loadKitComponents(tx: Prisma.TransactionClient, kitIds: string[]): Promise<Map<string, KitComponent[]>> {
  if (!kitIds.length) return new Map();
  const kits = await tx.kit.findMany({ where: { id: { in: kitIds } }, select: { id: true, items: true } });
  return new Map(kits.map((k) => {
    const arr = Array.isArray(k.items) ? (k.items as any[]) : [];
    return [k.id, arr.map((c) => ({ id: String(c.id), quantity: Number(c.quantity) || 0 }))];
  }));
}

// Reservado por peça, das locações ATIVAS que sobrepõem [pickup, return].
// excludeOrderId ignora um pedido (ex.: reccontagem ao editar). tx para rodar
// dentro da transação com lock.
export async function computeReserved(
  tx: Prisma.TransactionClient,
  pickup: string,
  ret: string,
  excludeOrderId?: string,
): Promise<Map<string, number>> {
  const rows = await tx.rentalOrderItem.findMany({
    where: {
      rental_orders: {
        status: 'ativo',
        // Sobreposição de intervalos: pickup <= fim  AND  return >= início.
        pickup_date: { lte: d(ret) },
        return_date: { gte: d(pickup) },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
    },
    select: { item_id: true, kit_id: true, quantity: true },
  });

  const kitIds = [...new Set(rows.filter((r) => r.kit_id).map((r) => r.kit_id!))];
  const kitComponents = await loadKitComponents(tx, kitIds);

  const reserved = new Map<string, number>();
  const add = (id: string, q: number) => reserved.set(id, (reserved.get(id) || 0) + q);
  for (const r of rows) {
    if (r.item_id) add(r.item_id, r.quantity);
    else if (r.kit_id) for (const c of kitComponents.get(r.kit_id) || []) add(c.id, c.quantity * r.quantity);
  }
  return reserved;
}

export type Shortfall = { item_id: string; name: string; requested: number; available: number };

// Verifica a demanda contra a disponibilidade no período. Retorna a lista de peças
// que faltaram (vazia = tudo ok). Deve rodar DENTRO da transação, DEPOIS do lock
// das linhas de inventory_items, para não haver corrida (venda dupla).
export async function findShortfalls(
  tx: Prisma.TransactionClient,
  lines: OrderLine[],
  pickup: string,
  ret: string,
  excludeOrderId?: string,
): Promise<Shortfall[]> {
  const kitIds = [...new Set(lines.filter((l) => l.kit_id).map((l) => l.kit_id!))];
  const kitComponents = await loadKitComponents(tx, kitIds);
  const demand = expandToItemDemand(lines, kitComponents);
  if (demand.size === 0) return [];

  const itemIds = [...demand.keys()];
  const pieces = await tx.inventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, stock_quantity: true } });
  const stockById = new Map(pieces.map((p) => [p.id, { name: p.name, stock: p.stock_quantity ?? 0 }]));
  const reserved = await computeReserved(tx, pickup, ret, excludeOrderId);

  const shortfalls: Shortfall[] = [];
  for (const [itemId, need] of demand) {
    const info = stockById.get(itemId);
    const stock = info?.stock ?? 0;
    const available = stock - (reserved.get(itemId) || 0);
    if (need > available) {
      shortfalls.push({ item_id: itemId, name: info?.name || 'peça', requested: need, available: Math.max(0, available) });
    }
  }
  return shortfalls;
}

// Disponível de UMA peça/kit num período (para o modal exibir "X de Y").
// Para kit, o disponível é o MENOR entre os componentes (quantos kits dá para montar).
export async function availableForLine(
  tx: Prisma.TransactionClient,
  line: { item_id?: string | null; kit_id?: string | null },
  pickup: string,
  ret: string,
): Promise<number> {
  const kitComponents = line.kit_id ? await loadKitComponents(tx, [line.kit_id]) : new Map<string, KitComponent[]>();
  const reserved = await computeReserved(tx, pickup, ret);
  const avail = async (itemId: string, perUnit: number) => {
    const piece = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { stock_quantity: true } });
    const free = (piece?.stock_quantity ?? 0) - (reserved.get(itemId) || 0);
    return Math.floor(Math.max(0, free) / perUnit);
  };
  if (line.item_id) return avail(line.item_id, 1);
  if (line.kit_id) {
    const comps = kitComponents.get(line.kit_id) || [];
    if (!comps.length) return 0;
    let min = Infinity;
    for (const c of comps) min = Math.min(min, await avail(c.id, c.quantity || 1));
    return min === Infinity ? 0 : min;
  }
  return 0;
}
