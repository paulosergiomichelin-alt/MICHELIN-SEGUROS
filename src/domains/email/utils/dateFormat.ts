import { format, parseISO, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function fmtDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Ontem';
    if (differenceInDays(new Date(), d) < 7) return format(d, 'EEE', { locale: ptBR });
    return format(d, 'dd/MM/yy');
  } catch {
    return '';
  }
}

// Rótulos de agrupamento por data, no mesmo espírito do Outlook clássico
// ("Semana Passada", "Duas Semanas Atrás" etc.) — usado para agrupar a lista de mensagens.
export function groupLabelForDate(iso?: string): string {
  if (!iso) return 'Mais Antigos';
  try {
    const d = parseISO(iso);
    if (isToday(d)) return 'Hoje';
    if (isYesterday(d)) return 'Ontem';
    const days = differenceInDays(new Date(), d);
    if (days < 7) return 'Esta Semana';
    if (days < 14) return 'Semana Passada';
    if (days < 21) return 'Duas Semanas Atrás';
    if (days < 28) return 'Três Semanas Atrás';
    if (days < 60) return 'Mês Passado';
    return 'Mais Antigos';
  } catch {
    return 'Mais Antigos';
  }
}

export function fmtFull(iso?: string): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}
