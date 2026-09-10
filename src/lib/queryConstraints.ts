export type ConstraintOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';

export type QueryConstraint =
  | { kind: 'where'; field: string; op: ConstraintOp; value: unknown }
  | { kind: 'orderBy'; field: string; direction: 'asc' | 'desc' }
  | { kind: 'limit'; n: number }
  | { kind: 'startAfter'; cursor: unknown };

export function where(field: string, op: ConstraintOp, value: unknown): QueryConstraint {
  return { kind: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { kind: 'orderBy', field, direction };
}

export function limit(n: number): QueryConstraint {
  return { kind: 'limit', n };
}

export function startAfter(cursor: unknown): QueryConstraint {
  return { kind: 'startAfter', cursor };
}
