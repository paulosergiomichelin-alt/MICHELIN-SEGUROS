import { and, asc, desc, eq, ne, gt, gte, lt, lte, inArray, sql } from 'drizzle-orm';
import type { QueryConstraint } from '../../src/lib/queryConstraints';

const OP_MAP: Record<string, (col: any, value: any) => any> = {
  '==': eq, '!=': ne, '<': lt, '<=': lte, '>': gt, '>=': gte,
  in: (col, value) => inArray(col, value as any[]),
  'array-contains': (col, value) => sql`${col} @> ${JSON.stringify([value])}::jsonb`,
};

// Só a tabela `leads` tem a coluna de cauda longa `data jsonb` (ADR-7 — schema híbrido é
// específico dela, ver SPEC.md §4.2). Em qualquer outra tabela, um campo que não é coluna
// promovida É UM ERRO DE CHAMADA (nome de campo errado ou faltando promover a coluna), não
// um caso a resolver silenciosamente — resolveField lança nesse caso em vez de gerar SQL inválido.
function resolveField(table: any, field: string) {
  if (table[field]) return table[field];
  if (table.data) return sql`${table.data}->>${field}`;
  throw new Error(`Campo "${field}" não é coluna de "${table}" e esta tabela não tem coluna "data" jsonb de fallback.`);
}

export function buildWhere(table: any, constraints: QueryConstraint[]) {
  const wheres = constraints
    .filter((c): c is QueryConstraint & { kind: 'where' } => c.kind === 'where')
    .map((c) => OP_MAP[c.op](resolveField(table, c.field), c.value));
  return wheres.length ? and(...wheres) : undefined;
}

// Retorna a constraint raw (não só o SQL já montado) porque o router precisa do `field` e
// `direction` originais para também montar a comparação de cursor do startAfter (keyset
// pagination).
export function getOrderByConstraint(constraints: QueryConstraint[]) {
  return constraints.find((c): c is QueryConstraint & { kind: 'orderBy' } => c.kind === 'orderBy');
}

export function buildOrderBy(table: any, constraints: QueryConstraint[]) {
  const ob = getOrderByConstraint(constraints);
  if (!ob) return undefined;
  const col = resolveField(table, ob.field);
  return ob.direction === 'desc' ? desc(col) : asc(col);
}

export function getLimit(constraints: QueryConstraint[]): number | undefined {
  return constraints.find((c): c is QueryConstraint & { kind: 'limit' } => c.kind === 'limit')?.n;
}

export function getStartAfter(constraints: QueryConstraint[]): unknown | undefined {
  return constraints.find((c): c is QueryConstraint & { kind: 'startAfter' } => c.kind === 'startAfter')?.cursor;
}

// Keyset pagination: "depois do cursor" na direção do orderBy ativo. Sem orderBy, startAfter
// não tem significado (paginação por cursor exige uma ordem estável) — o router ignora
// startAfter se não houver orderBy junto, em vez de falhar silenciosamente.
export function buildStartAfter(table: any, constraints: QueryConstraint[]) {
  const cursor = getStartAfter(constraints);
  const ob = getOrderByConstraint(constraints);
  if (cursor === undefined || !ob) return undefined;
  const col = resolveField(table, ob.field);
  return ob.direction === 'desc' ? lt(col, cursor) : gt(col, cursor);
}
