import { ValueTransformer } from 'typeorm';

/**
 * O driver pg devolve colunas bigint como string (para não perder precisão acima de 2^53).
 * Como os valores são centavos limitados a R$ 1 bilhão, number é seguro e mais prático.
 */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null | undefined) => (value === null || value === undefined ? value : Number(value)),
};
