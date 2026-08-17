/** 每个座位一个专属颜色,贯穿全部界面(头像、选人按钮、名字、结算) */
export const SEAT_COLORS = [
  { name: '朱', hex: '#e2564d' },
  { name: '橙', hex: '#e0913c' },
  { name: '金', hex: '#d9b23d' },
  { name: '翠', hex: '#57b87b' },
  { name: '青', hex: '#4fb6c9' },
  { name: '蓝', hex: '#7d95e8' },
  { name: '紫', hex: '#ab8ce4' },
  { name: '粉', hex: '#e08ab8' },
] as const;

export const seatColor = (seat: number): string => SEAT_COLORS[seat % SEAT_COLORS.length].hex;
