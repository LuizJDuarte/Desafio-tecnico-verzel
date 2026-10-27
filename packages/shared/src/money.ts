/**
 * Valores monetários trafegam SEMPRE como inteiros em centavos (number).
 * Isso evita erros de ponto flutuante (0,1 + 0,2) nas regras de lance e na carteira.
 * O teto prático (R$ 1 bilhão = 1e11 centavos) fica muito abaixo de Number.MAX_SAFE_INTEGER.
 */
const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100);
}

/**
 * Converte o texto digitado pelo usuário em centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234", "1.234" (milhar) e ",50".
 * Retorna null quando o texto não representa um valor válido com no máximo 2 casas decimais.
 */
export function parseBRLToCents(input: string): number | null {
  // \s também cobre o espaço não separável (U+00A0) que o Intl usa em "R$ 1.234,56".
  const cleaned = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (cleaned === '') return null;

  let integerPart: string;
  let fractionPart = '';

  if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length !== 2) return null;
    // Pontos só são aceitos como separador de milhar bem formado: 1.234.567,89
    if (parts[0].includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(parts[0])) return null;
    integerPart = parts[0].replace(/\./g, '');
    fractionPart = parts[1];
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    integerPart = cleaned.replace(/\./g, '');
  } else if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts.length !== 2) return null;
    integerPart = parts[0];
    fractionPart = parts[1];
  } else {
    integerPart = cleaned;
  }

  if (integerPart === '') integerPart = '0';
  if (!/^\d+$/.test(integerPart)) return null;
  if (fractionPart !== '' && !/^\d{1,2}$/.test(fractionPart)) return null;

  const cents = Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Formata centavos para edição em campo de texto: 123456 -> "1.234,56". */
export function centsToInputValue(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
