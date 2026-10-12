import type { SignalCategory } from '@/obd/signals';

/** Each signal family gets a traditional Japanese colour (伝統色). */
export const CATEGORY_COLOR: Record<SignalCategory, string> = {
  engine: 'var(--beni)', // 紅 crimson
  fuel: 'var(--matcha)', // 抹茶
  air: 'var(--asagi)', // 浅葱
  temperature: 'var(--kaki)', // 柿
  emissions: 'var(--fuji)', // 藤
  electrical: 'var(--kin)', // 金
  distance: 'var(--ai)', // 藍
};
