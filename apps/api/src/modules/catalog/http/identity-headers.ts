/**
 * Identificação da aplicação nas chamadas ao museu. A documentação da API do Art Institute of Chicago
 * pede o cabeçalho AIC-User-Agent com o nome do projeto e, opcionalmente, um contato (ARTIC_CONTACT),
 * para que o museu consiga falar com quem gera o tráfego antes de bloquear alguma coisa.
 */
export function museumIdentityHeaders(contact: string): Record<string, string> {
  const suffix = contact ? ` (${contact})` : '';
  return {
    'User-Agent': `ArremateLeiloes/1.0${contact ? ` (+${contact})` : ''}`,
    'AIC-User-Agent': `arremate-leiloes${suffix}`,
  };
}
