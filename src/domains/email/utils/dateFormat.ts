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

export function fmtFull(iso?: string): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}
