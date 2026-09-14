export const HOUR_HEIGHT = 48; // px por hora na grade de Dia/Semana/Semana de Trabalho
export const SNAP_MINUTES = 15;

export function startOfGridDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Converte um horário pro deslocamento vertical (px) dentro da grade do dia dele. */
export function timeToY(date: Date): number {
  const dayStart = startOfGridDay(date);
  const minutesFromMidnight = (date.getTime() - dayStart.getTime()) / 60000;
  return (minutesFromMidnight / 60) * HOUR_HEIGHT;
}

/** Converte um deslocamento vertical (px) dentro de um dia pro horário, arredondado pro snap. */
export function yToTime(y: number, dayDate: Date): Date {
  const dayStart = startOfGridDay(dayDate);
  const rawMinutes = (y / HOUR_HEIGHT) * 60;
  const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  const clamped = Math.max(0, Math.min(24 * 60, snapped));
  return new Date(dayStart.getTime() + clamped * 60000);
}

/** Altura (px) de um bloco de evento na grade, com altura mínima de 15min pra ficar clicável. */
export function durationToHeight(startAt: Date, endAt: Date): number {
  const minutes = (endAt.getTime() - startAt.getTime()) / 60000;
  return Math.max(HOUR_HEIGHT / 4, (minutes / 60) * HOUR_HEIGHT);
}
