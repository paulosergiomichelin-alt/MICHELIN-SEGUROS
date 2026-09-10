import {
  where as fsWhere,
  orderBy as fsOrderBy,
  limit as fsLimit,
  startAfter as fsStartAfter,
  QueryConstraint as FirestoreQueryConstraint,
} from 'firebase/firestore';
import type { QueryConstraint } from './queryConstraints';

// Traduz o módulo neutro de constraints (src/lib/queryConstraints.ts) de volta para
// instâncias reais do Firestore — necessário porque, a partir da troca de import da
// Fase 2 (DataService.ts e call-sites deixam de importar where/orderBy/limit/startAfter
// de 'firebase/firestore'), qualquer array de constraints que chega até o caminho de
// fallback Firestore (USE_POSTGRES=false) já vem no formato neutro. `query()` do
// Firestore exige objetos QueryConstraint reais, não os objetos planos {kind:...} —
// sem esta tradução, o caminho Firestore quebraria em runtime.
export function toFirestoreConstraints(constraints: QueryConstraint[]): FirestoreQueryConstraint[] {
  return constraints.map((c) => {
    switch (c.kind) {
      case 'where':
        return fsWhere(c.field, c.op as any, c.value);
      case 'orderBy':
        return fsOrderBy(c.field, c.direction);
      case 'limit':
        return fsLimit(c.n);
      case 'startAfter':
        return fsStartAfter(c.cursor);
    }
  });
}
