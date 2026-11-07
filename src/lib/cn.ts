export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export const EASE = [0.16, 1, 0.3, 1] as const
export const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 } as const
export const SOFT_SPRING = { type: 'spring', stiffness: 220, damping: 26 } as const
