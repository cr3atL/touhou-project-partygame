/** Seven-character baseline. The optional destruction candidate is not equipped. */
export const BALANCE = {
  reimu: { cooldown: 3, targets: 2 },
  marisa: { cooldown: 3, range: 6, targets: 2, knockback: 2, advance: 1 },
  yukari: { cooldown: 3, advance: 3, buffer: 1 },
  remilia: { cooldown: 3, spawnShield: true },
  flandre: { cooldown: 3, range: 3, knockback: 4, cost: 1, splitThreshold: 4 },
  yuyuko: { cooldown: 3, range: 4, slow: 2, knockback: 2, advance: 1 },
  youmu: { cooldown: 4, cleanseCooldown: 2, dash: 2, knockback: 2 }
} as const;
