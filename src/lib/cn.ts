import { clsx, type ClassValue } from 'clsx'
/** Concatène des classes conditionnelles (helper standard). */
export const cn = (...inputs: ClassValue[]) => clsx(inputs)
