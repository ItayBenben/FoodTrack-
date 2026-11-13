// Argon2id parameters from 06 §5: m = 64 MB, t = 3, p = 4.
export const ARGON2 = { memoryCost: 65536, timeCost: 3, parallelism: 4, algorithm: 2 as const };
