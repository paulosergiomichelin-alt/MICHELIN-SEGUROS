// Drizzle com `mode: 'string'` em colunas timestamp evita o crash "value.toISOString is
// not a function" (o app inteiro manda ISO strings, nunca objetos Date, em createdAt/
// updatedAt/etc via DataService.normalizePayload) — mas em troca, LEITURAS retornam o
// formato de texto nativo do Postgres ("2026-09-10 20:07:52.606+00"), não ISO 8601
// ("2026-09-10T20:07:52.606Z"). Todo o resto do app assume ISO (types.ts declara esses
// campos como `string` e formata/compara assumindo esse formato) — sem esta normalização
// na borda da API, comparações de string exatas (ex.: DataService.hasChanges) e qualquer
// parsing mais estrito quebrariam silenciosamente.
//
// Captura data/hora e offset em grupos separados porque `new Date('...+00')` retorna NaN
// — o parser nativo do JS exige offset de 2 dígitos com minutos ("+00:00") ou "Z", e o
// Postgres devolve offset de só 2 dígitos sem minutos quando são zero. Sem essa
// reconstrução manual, o parse falha silenciosamente e a função devolve o valor original
// sem avisar (foi descoberto só com depuração passo a passo, não pelo teste da regex
// isolado — o teste da regex sozinho não pega falha de parse de Date depois do match).
const PG_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:([+-])(\d{2})(?::?(\d{2}))?)?$/;

export function normalizeTimestamps<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString() as any;
  if (Array.isArray(value)) return value.map((v) => normalizeTimestamps(v)) as any;
  if (typeof value === 'string') {
    const m = value.match(PG_TIMESTAMP_RE);
    if (m) {
      const [, datePart, timePart, sign, offH, offM] = m;
      const offset = sign ? `${sign}${offH}:${offM ?? '00'}` : 'Z';
      const d = new Date(`${datePart}T${timePart}${offset}`);
      return (isNaN(d.getTime()) ? value : d.toISOString()) as any;
    }
    return value as any;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) out[k] = normalizeTimestamps(v);
    return out as any;
  }
  return value;
}
