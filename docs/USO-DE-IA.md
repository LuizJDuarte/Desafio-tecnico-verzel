# Uso de IA no desenvolvimento

O enunciado permite o uso de IA e pede transparência sobre onde e como ela foi usada. Este documento registra isso.

## Ferramenta

Claude (Anthropic), usado por meio do Claude Code como assistente de programação, com acesso a um ambiente de desenvolvimento com terminal, PostgreSQL local e um navegador automatizado para testes e capturas de tela.

## Onde e como foi usada

- **Planejamento:** o PDF completo do desafio foi passado à IA, que levantou os requisitos, propôs a arquitetura e apresentou opções. As escolhas da API externa (Art Institute of Chicago), do back-end (NestJS + TypeORM) e da hospedagem (Render + Neon) foram minhas, a partir dessas opções.
- **Código:** a maior parte do código do back-end, do front-end e do pacote compartilhado foi escrita pela IA, em iterações, a partir dos requisitos do enunciado.
- **Testes:** os testes de unidade, integração e ponta a ponta também foram escritos com a IA, que os executou a cada mudança e corrigiu as falhas encontradas.
- **Infraestrutura e documentação:** Dockerfile, Docker Compose, workflow de CI, Blueprint do Render, `.env.example` e este README.
- **Interface:** a direção visual (inspirada em parede de galeria de museu, com etiquetas de obra e as "raquetes" de leilão) foi proposta pela IA e ajustada a partir de capturas de tela de cada página, nos modos claro e escuro e no celular.

## Problemas encontrados e ajustes feitos durante o desenvolvimento

A IA não acertou tudo de primeira. Alguns exemplos do que foi encontrado nas verificações e corrigido:

- **Dependências:** as versões mais novas publicadas no npm (NestJS 12, TypeORM 1.x, TypeScript 7) tinham mudanças incompatíveis; as versões foram fixadas em majors estáveis.
- **Extrato da carteira:** movimentações gravadas no mesmo instante (por exemplo, liberar o valor de quem foi superado e comprometer o do novo líder) apareciam em ordem aleatória. Foi criada uma coluna de sequência para ordenar de forma determinística.
- **Seed:** os lotes de demonstração são criados com datas no passado, e o agendador podia liquidar um lote antes de os lances de demonstração serem registrados. O agendador passou a ser pausado durante a seed.
- **Interface:** sobreposição entre preço e contagem regressiva, contraste insuficiente no modo escuro, mesa de lances muito abaixo da dobra no celular e mensagens de recusa que continuavam na tela depois do encerramento.
- **Erros no console:** páginas públicas geravam um 401 a cada carregamento; `GET /api/auth/me` passou a responder `{ user: null }` para visitantes.
- **Sessão entre abas:** trocar de conta em uma aba deixava as outras mostrando o usuário anterior. As abas passaram a se atualizar e avisar.
- **API externa:** com a API do museu fora do ar, uma busca nunca feita antes falhava. Passou a procurar entre as obras que a casa já conhece.
- **Docker local:** a diretiva de CSP `upgrade-insecure-requests` quebrava o carregamento em `http://localhost`; ela passou a valer só quando o site é servido por HTTPS.
- **Teste de encerramento:** o teste ponta a ponta subestimava a duração do lote porque o próprio lance do teste disparava a prorrogação. O teste passou a verificar a prorrogação e a esperar o fim real.
- **Textos:** mensagens geradas sem acentuação foram reescritas em português correto.

## Como o resultado foi verificado

- 164 testes automatizados (unidade, integração contra PostgreSQL real e ponta a ponta com Playwright), executados também no GitHub Actions a cada push.
- ESLint, checagem de tipos e Prettier em todo o monorepo.
- Roteiro manual pela API cobrindo cada tipo de recusa de lance, saldos da carteira, painel do leiloeiro e auditoria (íntegra e adulterada).
- Capturas de tela de todas as páginas para revisão visual.
- Build e execução da imagem Docker contra um PostgreSQL.
