import { describe, it, expect } from 'vitest';
import { HOUR_HEIGHT, timeToY, yToTime, durationToHeight, startOfGridDay } from '../gridMath';

describe('gridMath', () => {
  it('startOfGridDay zera hora/minuto/segundo', () => {
    const d = startOfGridDay(new Date('2026-01-10T14:35:20'));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('timeToY(meia-noite) = 0', () => {
    expect(timeToY(new Date('2026-01-10T00:00:00'))).toBe(0);
  });

  it('timeToY(1h) = HOUR_HEIGHT', () => {
    expect(timeToY(new Date('2026-01-10T01:00:00'))).toBe(HOUR_HEIGHT);
  });

  it('timeToY(1h30) = 1.5 * HOUR_HEIGHT', () => {
    expect(timeToY(new Date('2026-01-10T01:30:00'))).toBe(HOUR_HEIGHT * 1.5);
  });

  it('yToTime(0) volta meia-noite do dia informado', () => {
    const result = yToTime(0, new Date('2026-01-10T00:00:00'));
    expect(result.getHours()).toBe(0);
    expect(result.getDate()).toBe(10);
  });

  it('yToTime arredonda pro snap de 15 minutos mais próximo', () => {
    // 7 minutos em pixels: (7/60) * HOUR_HEIGHT -> arredonda pra 0min (mais perto de 0 que de 15)
    const y7min = (7 / 60) * HOUR_HEIGHT;
    const result = yToTime(y7min, new Date('2026-01-10T00:00:00'));
    expect(result.getMinutes()).toBe(0);

    // 10 minutos -> mais perto de 15 que de 0
    const y10min = (10 / 60) * HOUR_HEIGHT;
    const result2 = yToTime(y10min, new Date('2026-01-10T00:00:00'));
    expect(result2.getMinutes()).toBe(15);
  });

  it('durationToHeight(1h) = HOUR_HEIGHT', () => {
    const start = new Date('2026-01-10T10:00:00');
    const end = new Date('2026-01-10T11:00:00');
    expect(durationToHeight(start, end)).toBe(HOUR_HEIGHT);
  });

  it('durationToHeight tem altura mínima pra eventos muito curtos', () => {
    const start = new Date('2026-01-10T10:00:00');
    const end = new Date('2026-01-10T10:05:00');
    expect(durationToHeight(start, end)).toBe(HOUR_HEIGHT / 4);
  });
});
