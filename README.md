# Arremate

Casa de leilões online de obras em domínio público do Art Institute of Chicago. O leiloeiro monta lotes a partir do acervo do museu e os licitantes disputam com lances ao vivo, usando uma carteira com saldo comprometido. Todo o histórico de lances é encadeado e assinado digitalmente, e qualquer pessoa pode auditá-lo sem login.

Projeto desenvolvido para o desafio técnico Elite Dev da Verzel (vaga de Desenvolvedor(a) Júnior Full Stack).

- **Aplicação no ar:** https://SEU-SERVICO.onrender.com (substituir pelo link do deploy)
- **Documentação interativa da API (Swagger):** `/api/docs` no mesmo endereço
- **Contas de demonstração:** senha `arremate123` para todas (detalhes abaixo)

> O plano gratuito do Render hiberna o servidor depois de 15 minutos sem acesso. O primeiro carregamento pode levar até um minuto; depois disso tudo responde normalmente.

## Sumário

1. [Acesso rápido](#acesso-rápido)
2. [Requisitos do desafio e onde encontrá-los](#requisitos-do-desafio-e-onde-encontrá-los)
3. [Stack e decisões](#stack-e-decisões)
4. [Arquitetura](#arquitetura)
5. [Regras de negócio](#regras-de-negócio)
6. [Concorrência](#concorrência)
7. [Histórico à prova de adulteração](#histórico-à-prova-de-adulteração)
8. [Privacidade](#privacidade)
9. [Resiliência à API externa](#resiliência-à-api-externa)
10. [Como executar localmente](#como-executar-localmente)
11. [Testes automatizados](#testes-automatizados)
12. [Deploy no Render + Neon](#deploy-no-render--neon)
13. [Variáveis de ambiente](#variáveis-de-ambiente)
14. [Referência da API](#referência-da-api)
15. [Comportamentos que podem surpreender](#comportamentos-que-podem-surpreender)
16. [Limitações e próximos passos](#limitações-e-próximos-passos)
17. [Uso de IA](#uso-de-ia)
18. [Estrutura de pastas](#estrutura-de-pastas)

## Acesso rápido

### Contas de demonstração

A tela **Entrar** tem um botão para cada conta, então não é preciso digitar nada.

| Perfil    | Nome                   | E-mail                  | Situação inicial                                                  |
| --------- | ---------------------- | ----------------------- | ----------------------------------------------------------------- |
| Leiloeiro | Galeria Aurora Leilões | `leiloeiro@example.com` | Dono de todos os lotes; já recebeu R$ 280.000,00 em vendas        |
| Licitante | Ana Souza              | `ana@example.com`       | Total R$ 270.000,00, comprometido R$ 130.000,00 (lidera o lote 5) |
| Licitante | Bruno Lima             | `bruno@example.com`     | Total R$ 450.000,00, comprometido R$ 100.000,00 (lidera o lote 6) |

Também é possível criar contas novas em **Criar conta**, escolhendo o perfil.

### O que já vem na base

Na primeira inicialização com o banco vazio, a aplicação cria os dados de demonstração usando os mesmos serviços da API (com horários retroativos). Por isso todos os históricos têm hashes e assinaturas válidos de verdade.

| Lote | Obra                                      | Situação  | Detalhe                                                                                                      |
| ---- | ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | _A Sunday on La Grande Jatte_ (Seurat)    | Encerrado | Arrematado pela Ana por R$ 230.000,00. O último lance caiu no último minuto e prorrogou o fim                |
| 2    | _Self-Portrait_ (Van Gogh)                | Encerrado | Sem lances: fechou sem vencedor                                                                              |
| 3    | _At the Moulin Rouge_ (Toulouse-Lautrec)  | Encerrado | Arrematado pelo Bruno. O lance #2 foi alterado direto no banco para demonstrar a auditoria acusando a fraude |
| 4    | _The Child's Bath_ (Mary Cassatt)         | Cancelado | Cancelado pelo leiloeiro; não aparece na vitrine                                                             |
| 5    | _The Bedroom_ (Van Gogh)                  | Ao vivo   | Ana lidera com R$ 130.000,00                                                                                 |
| 6    | _Water Lilies_ (Monet)                    | Ao vivo   | Lote principal da demonstração: Bruno lidera com R$ 100.000,00 depois de 4 lances                            |
| 7    | _Under the Wave off Kanagawa_ (Hokusai)   | Ao vivo   | Sem lances                                                                                                   |
| 8    | _Two Sisters (On the Terrace)_ (Renoir)   | Ao vivo   | Sem lances                                                                                                   |
| 9    | _Paris Street; Rainy Day_ (Caillebotte)   | Agendado  | Abre 2 dias depois da criação da base                                                                        |
| 10   | _Stacks of Wheat (End of Summer)_ (Monet) | Agendado  | Abre 5 dias depois da criação da base                                                                        |

Os lotes ao vivo terminam entre 7 e 30 dias depois da criação da base, então continuam abertos durante todo o período de avaliação.

### Roteiro sugerido para avaliar (cerca de 10 minutos)

1. **Vitrine sem login.** Veja as abas Ao vivo, Agendados e Encerrados, a busca por título ou artista e a ordenação. O lote cancelado não aparece.
2. **Dois licitantes ao mesmo tempo.** Entre como Ana em uma janela normal e como Bruno em uma **janela anônima** (ou em outro navegador). As abas de um mesmo navegador compartilham a sessão, então duas abas comuns não servem para isso.
3. **Lances ao vivo.** Abra o lote 6 nas duas janelas. Ana dá o lance mínimo com um clique; na janela do Bruno o lance aparece sem recarregar, com "Você foi superado" e uma notificação.
4. **Recusas com motivo.** Tente um valor abaixo do mínimo, tente cobrir o próprio lance, tente um valor maior que o saldo disponível, abra um lote agendado (9 ou 10) e um encerrado. Cada caso mostra uma mensagem específica.
5. **Carteira.** Confira total, comprometido e disponível, faça um depósito simulado e veja o extrato.
6. **Leiloeiro e prorrogação.** Use outro navegador para o leiloeiro, ou saia da conta da Ana na janela normal e entre como leiloeiro (janelas anônimas compartilham a mesma sessão entre si). Clique em **Novo lote** no menu, busque "Monet" ou "Hokusai", escolha a obra, marque **Começar agora** e use a duração rápida **3 min**. Dê lances nos últimos 2 minutos e veja o fim ser prorrogado. Ao encerrar, a sala avisa o arrematante, o comprovante é emitido e o painel mostra o resultado e o total recebido.
7. **Auditoria.** Sem login, abra `/auditoria/<id>` do lote 3 (link **Auditar** na sala do lote): o resultado é "Histórico adulterado", com o lance e o motivo. O lote 1 aparece como "Histórico íntegro". A página repete a verificação no seu navegador, sem depender da resposta do servidor.
8. **Comprovante.** Como Ana, abra **Meus arremates** e o comprovante do lote 1: ele tem link público para compartilhar, QR code e assinatura verificável.

A página **Como funciona** (no menu) resume as regras para quem usa a aplicação.

## Requisitos do desafio e onde encontrá-los

| Requisito                                                          | Como foi atendido                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dois papéis: leiloeiro cria e gerencia lotes, licitante dá lances  | Papel escolhido no cadastro e checado no servidor em cada rota (`@Authenticated('AUCTIONEER')`). Leiloeiro recebe recusa clara se tentar dar lance                 |
| Vitrine com ao vivo, agendados e encerrados; cancelados ocultos    | Página inicial com abas, busca, ordenação e paginação; a fase é calculada pelo relógio do servidor                                                                 |
| Painel do leiloeiro                                                | Busca no acervo do museu, criação de lote (imagem, título, atributos, início, fim, valor mínimo e incremento), cancelamento, resultados e total recebido           |
| Sala do lote ao vivo                                               | Lance atual, histórico, posição do usuário, contagem regressiva, "você está ganhando" e "você foi superado", tudo via WebSocket, sem recarregar                    |
| Carteira                                                           | Total, comprometido e disponível, depósito simulado e extrato com saldo após cada movimentação                                                                     |
| Meus arremates                                                     | Lotes em que o usuário deu lance, situação de cada um e comprovante com link público, QR code e botão de compartilhar                                              |
| Auditoria pública sem login                                        | `/auditoria/:id` mostra "íntegro" ou "adulterado", com cada verificação e cada problema encontrado                                                                 |
| Mensagens para cada lance recusado                                 | Abaixo do mínimo, saldo insuficiente, já está ganhando, não iniciado e encerrado (além de cancelado e papel errado), com o valor de referência quando faz sentido  |
| Resiliência à API externa                                          | Vitrine, salas, auditoria e comprovante não dependem da API; a busca tem cache, retentativas, limitador e circuit breaker ([detalhes](#resiliência-à-api-externa)) |
| Regras de lance                                                    | Só lotes ao vivo; primeiro lance maior ou igual ao inicial; seguintes maiores ou iguais ao atual mais o incremento; líder não cobre o próprio lance                |
| Saldo comprometido                                                 | O lance precisa caber no disponível; ao ser superado, o valor volta na hora ([detalhes](#saldo-comprometido))                                                      |
| Anti-sniping                                                       | Lance aceito nos últimos 2 minutos leva o fim para 2 minutos depois dele ([interpretação](#prorrogação-anti-sniping))                                              |
| Liquidação                                                         | No horário exato: debita o vencedor, credita o leiloeiro e emite comprovante assinado; sem lances, fecha sem vencedor                                              |
| Histórico à prova de adulteração, inclusive contra edição no banco | Cadeia de hashes SHA-256 com assinaturas Ed25519 e chave fora do banco ([técnica](#histórico-à-prova-de-adulteração))                                              |
| Privacidade na auditoria e no comprovante                          | Licitantes aparecem só por pseudônimo, diferente em cada lote ([detalhes](#privacidade))                                                                           |
| Seed: 1 leiloeiro, 2 clientes, 1 lote publicado com lances abertos | 1 leiloeiro, 2 licitantes e 10 lotes em todos os estados, 2 deles ao vivo com lances                                                                               |
| Opcional: busca e filtro                                           | Vitrine com busca por título ou artista, abas e 5 ordenações; busca no acervo do museu no painel                                                                   |
| Opcional: cancelamento com estorno automático                      | Lote com lances pode ser cancelado até o fim; o valor comprometido do líder volta ao disponível na mesma transação                                                 |
| Opcional: Docker Compose                                           | `docker compose up --build` sobe banco e aplicação                                                                                                                 |
| Opcional: testes automatizados                                     | 164 testes de unidade, integração e ponta a ponta, rodando no GitHub Actions ([detalhes](#testes-automatizados))                                                   |
| Opcional: modo escuro                                              | Botão no topo; respeita a preferência do sistema na primeira visita                                                                                                |
| README, deploy, seed                                               | Este documento, `render.yaml` (Render + Neon) e seed automática na primeira inicialização                                                                          |

## Stack e decisões

| Camada               | Escolha                                                                        | Por quê                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back-end             | Node.js 22, NestJS 11, TypeScript                                              | Módulos, injeção de dependência, guards e pipes de validação deixam regras de negócio isoladas e testáveis (organização parecida com Spring, que eu já conheço)         |
| Banco                | PostgreSQL 16 com TypeORM 0.3                                                  | Dinheiro e lances pedem transações ACID, locks de linha (`SELECT ... FOR UPDATE`) e `CHECK` constraints. Esquema versionado só por migrations (`synchronize` desligado) |
| Tempo real           | Socket.IO 4                                                                    | Reconexão automática e fallback para long polling; salas por lote (públicas) e por usuário (privadas)                                                                   |
| Front-end            | React 19, Vite 7, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query 5 | TanStack Query cuida de cache e revalidação; os eventos do WebSocket atualizam o cache direto, sem recarregar a página                                                  |
| Código compartilhado | Pacote `@arremate/shared`                                                      | Regras de lance, formatação de dinheiro, contratos da API e o **verificador da auditoria** são os mesmos no servidor e no navegador                                     |
| API externa          | Art Institute of Chicago                                                       | Pública, sem chave, com imagens em domínio público (CC0) e atributos ricos (artista, data, técnica, dimensões, procedência)                                             |
| Testes               | Vitest, Jest + Supertest, Playwright                                           | Unidade, integração contra PostgreSQL real e ponta a ponta no navegador                                                                                                 |
| Deploy               | Render (web service gratuito) + Neon (PostgreSQL gratuito)                     | Um único serviço serve API, WebSocket e front na mesma origem: sem CORS, cookie de sessão simples e menos peças para manter                                             |

Outras decisões que valem explicar:

- **Monorepo com npm workspaces** (`apps/api`, `apps/web`, `packages/shared`): um único `npm ci` e um único repositório para avaliar.
- **Dinheiro sempre em centavos inteiros.** Evita erros de ponto flutuante nas regras de lance e na carteira. A conversão para reais acontece só na exibição.
- **Sessão em cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção.** O token não fica acessível a JavaScript (protege contra roubo por XSS). Como defesa extra contra CSRF, requisições que alteram dados precisam vir da própria origem. A API também aceita `Authorization: Bearer` para testes e ferramentas.
- **Configuração validada na inicialização** (zod): se faltar um segredo em produção, a aplicação nem sobe, em vez de falhar no meio de um lance.
- **Segurança básica:** senhas com bcrypt, Helmet com Content Security Policy, limite de requisições por IP, validação estrita do corpo das requisições (campos desconhecidos são recusados) e proteção contra SSRF no download de imagens (só domínios do museu).

## Arquitetura

```
                  navegador (React)
        HTTP /api  |            |  WebSocket /socket.io
                   v            v
   +-------------------------------------------------+
   |  NestJS (um processo)                           |
   |  auth | lots | bidding | settlement | wallet    |
   |  audit | catalog | images | realtime | health   |
   |  serve também o front compilado (apps/web/dist) |
   +-------------------------------------------------+
          |                              |
          v                              v
   PostgreSQL (Neon)            API do Art Institute of Chicago
   lotes, lances, carteiras,    (só na busca e na criação de lotes,
   extrato, comprovantes,        com cache, limitador e circuit breaker)
   imagens e cache da API
```

Fluxo de um lance:

1. O front envia `POST /api/lots/:id/bids` com o valor em centavos.
2. O `BiddingService` abre uma transação, trava a linha do lote, valida as regras na ordem documentada, trava as carteiras envolvidas, move os valores comprometidos, calcula a prorrogação, grava o lance encadeado e assinado e reassina o selo do lote.
3. Só depois do commit o servidor publica `lot:bid` na sala do lote, `wallet:updated` para quem deu o lance e `bid:outbid` para quem foi superado.
4. Cada aba aberta atualiza a tela a partir do evento, sem nova requisição.

## Regras de negócio

### Lances

As validações acontecem dentro da transação, com o lote travado, nesta ordem (que define qual mensagem o licitante recebe):

| Ordem | Situação                                     | Mensagem exibida (exemplo)                                                                                                                        |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Usuário é leiloeiro                          | Leiloeiros não podem dar lances. Entre com uma conta de licitante.                                                                                |
| 2     | Lote cancelado                               | Este lote foi cancelado pelo leiloeiro e não aceita lances.                                                                                       |
| 3     | Lote encerrado (inclusive no instante final) | Este lote já foi encerrado e não aceita mais lances.                                                                                              |
| 4     | Lote ainda não começou                       | Este lote ainda não começou. Os lances abrem em 29/10/2026 às 14:00.                                                                              |
| 5     | Licitante já é o líder                       | Você já é o líder deste lote. Não é possível cobrir o próprio lance.                                                                              |
| 6     | Abaixo do mínimo                             | O primeiro lance precisa ser de pelo menos R$ 80.000,00 (lance inicial). / Agora o menor lance aceito é R$ 102.500,00 (lance atual + incremento). |
| 7     | Saldo disponível insuficiente                | Saldo insuficiente: seu saldo disponível é R$ 7.000,00 e o lance é de R$ 8.000,00. Faça um depósito na carteira para continuar.                   |

Regras de valor:

- **Primeiro lance:** maior ou igual ao lance inicial do lote.
- **Lances seguintes:** maiores ou iguais ao lance atual mais o incremento mínimo.
- O intervalo de lances é do início (inclusive) até o fim (exclusive).

A API responde recusas com HTTP 422 (403 quando é um leiloeiro tentando dar lance) e um corpo `{ code, message, details }`. O front monta a mensagem final com a mesma tabela do pacote compartilhado, para mostrar datas no fuso de quem está usando.

### Saldo comprometido

Cada carteira tem **total** (`balance`) e **comprometido** (`held`). O **disponível** é `total - comprometido`.

- Ao liderar um lote, o valor do lance passa a ser comprometido. Ele continua no total, mas não pode ser usado em outro lance.
- Ao ser superado, o valor volta ao disponível na mesma transação do lance que o superou.
- Um novo lance só é aceito se couber no disponível.
- Na liquidação, o valor sai do comprometido e do total do vencedor e entra no total do leiloeiro.

Exemplo: Ana deposita R$ 10.000,00 e lidera o lote A com R$ 3.000,00. Ela tem total de R$ 10.000,00, comprometido de R$ 3.000,00 e disponível de R$ 7.000,00. Um lance de R$ 8.000,00 no lote B é recusado por saldo insuficiente. Se o Bruno cobrir a Ana no lote A, o disponível dela volta a R$ 10.000,00 imediatamente.

Cada movimentação (depósito, comprometimento, liberação, débito e crédito de venda) gera uma linha no extrato com os saldos resultantes. O banco tem `CHECK` constraints (`held <= balance`, valores não negativos) como última linha de defesa contra qualquer bug.

### Prorrogação (anti-sniping)

O enunciado diz: "lance aceito nos últimos 2 minutos estende o fim do lote para +2 minutos".

**Interpretação adotada:** se um lance é aceito quando faltam 2 minutos ou menos, o novo fim passa a ser **o momento do lance mais 2 minutos**. O fim nunca é antecipado.

| Fim atual | Momento do lance | Faltavam | Novo fim               |
| --------- | ---------------- | -------- | ---------------------- |
| 20:00:00  | 19:57:00         | 3 min    | 20:00:00 (sem mudança) |
| 20:00:00  | 19:58:30         | 1min30   | 20:00:30               |
| 20:00:30  | 20:00:10         | 20 s     | 20:02:10               |

Por que essa leitura: ela garante sempre 2 minutos inteiros para os outros licitantes reagirem a um lance de última hora, que é o objetivo do anti-sniping. A alternativa (somar 2 minutos ao fim atual a cada lance) faz uma rajada de lances empurrar o fim muito além do necessário.

A janela e a extensão são configuráveis (`ANTI_SNIPING_WINDOW_SECONDS` e `ANTI_SNIPING_EXTENSION_SECONDS`, padrão 120). Os valores ficam gravados em cada lote no momento da criação e fazem parte dos termos assinados, então mudar a configuração não altera lotes já criados e a auditoria reproduz a regra que valia para aquele lote. Cada lance registra o prazo final logo depois dele (`endsAtAfter`), e a sala mostra "Prorrogado por lances de última hora".

### Encerramento e liquidação

- Um agendador acorda **no instante exato** em que o próximo lote termina (em vez de consultar o banco a cada segundo) e liquida os lotes vencidos.
- Com lances: debita o vencedor, credita o leiloeiro e emite um comprovante numerado e assinado digitalmente. A sala avisa todo mundo (`lot:closed`), o vencedor recebe "Você arrematou" com o link do comprovante (`lot:won`) e o leiloeiro recebe a venda (`lot:sold`).
- Sem lances: o lote fecha sem vencedor e sem comprovante.
- É idempotente e segura com mais de uma instância: o lote é travado com `FOR UPDATE SKIP LOCKED`, e dentro do lock o serviço confere de novo se ele continua aberto e se o prazo (talvez prorrogado) já passou.
- Rede de segurança: ao abrir a sala de um lote vencido que ainda não foi liquidado (por exemplo, porque o servidor estava hibernando), a liquidação acontece na hora.

### Cancelamento com estorno

O leiloeiro dono do lote pode cancelá-lo até o fim. Sem lances, o lote só muda de situação. Com lances, o valor comprometido do líder volta ao disponível dele na mesma transação, e ele recebe a atualização da carteira em tempo real. O cancelamento também é registrado no selo assinado do lote. Lotes cancelados saem da vitrine, mas a sala e a auditoria continuam acessíveis pelo link.

## Concorrência

Dois licitantes podem clicar no mesmo segundo. A solução usa os mecanismos do PostgreSQL em vez de controle em memória (que quebraria com mais de uma instância):

1. **Uma transação por lance**, em READ COMMITTED, que começa com `SELECT ... FOR UPDATE` na linha do lote. Lances no mesmo lote ficam em fila: o segundo só lê o lote depois do commit do primeiro e já enxerga o novo preço e o novo líder. Lances em lotes diferentes seguem em paralelo.
2. **O relógio é lido depois de obter o lock**, então a ordem dos horários acompanha a ordem da cadeia de hashes.
3. **Carteiras travadas sempre em ordem crescente de id.** Quando A supera B no lote 1 enquanto B supera A no lote 2, as duas transações pedem os locks na mesma ordem e não há deadlock.
4. **Retentativa automática** em conflitos transitórios (`40001`, `40P01`, `55P03`), com backoff e jitter.
5. **Restrições no banco:** índice único em `(lot_id, seq)` nos lances e `CHECK` constraints nas carteiras e nos lotes.
6. **Eventos publicados só depois do commit**, para ninguém ver na tela um lance que foi desfeito.

Os testes de integração disparam 12 lances simultâneos com o mesmo valor (exatamente 1 é aceito), disputas paralelas com valores crescentes, o mesmo licitante em dois lotes com saldo para apenas um, e lideranças cruzadas em dois lotes ao mesmo tempo.

## Histórico à prova de adulteração

Requisito: mesmo quem altera o banco diretamente não pode mudar o histórico sem ser detectado.

### Técnica

1. **Termos do lote assinados (gênese).** Na criação, os termos imutáveis (item, lance inicial, incremento, início, fim original e regra de prorrogação) são serializados de forma canônica, com hash SHA-256 e assinatura Ed25519.
2. **Cadeia de hashes.** Cada lance guarda o hash do anterior (o primeiro aponta para a gênese). O hash cobre lote, número de sequência, pseudônimo do licitante, valor, horário, prazo final depois do lance e hash anterior. Alterar, remover ou inserir qualquer lance quebra a cadeia a partir dali.
3. **Assinatura digital de cada registro.** A chave privada Ed25519 é derivada do segredo `AUDIT_SIGNING_SECRET`, que fica só na variável de ambiente do servidor e **nunca vai para o banco**. Quem tem acesso ao PostgreSQL consegue mudar dados e até recalcular hashes, mas não consegue produzir assinaturas válidas.
4. **Selo do lote.** A cada lance, cancelamento ou liquidação, o servidor reassina um "selo" com situação, quantidade de lances, hash do último lance e prazo final. Isso detecta a remoção do último lance (truncamento), que uma cadeia sozinha não denunciaria.
5. **Regras reproduzidas.** O verificador refaz o leilão lance a lance com as mesmas funções que o servidor usou: janela de início e fim, mínimo, incremento, vez do líder e prorrogação. Um lance que nunca poderia ter sido aceito é apontado.
6. **Comprovante assinado** e amarrado ao hash do último lance.
7. **Vínculo dos pseudônimos.** O servidor confere se cada pseudônimo corresponde ao licitante real gravado (HMAC com segredo próprio), sem revelar quem é. Trocar o autor de um lance no banco é detectado.

Os dados são serializados como arrays JSON com um identificador de esquema (`arremate-audit/v1`), o que evita ambiguidade de campos e permite evoluir o formato.

### O que é detectado

| Ataque direto no banco                                | Como é detectado                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| Alterar o valor de um lance                           | Hash não confere, assinatura inválida e, em geral, regra violada        |
| Alterar o valor e recalcular o hash                   | Assinatura inválida (sem a chave privada não há como reassinar)         |
| Apagar um lance do meio                               | Lacuna na sequência e encadeamento quebrado                             |
| Apagar o último lance (com ou sem "consertar" o lote) | O selo assinado do lote não confere                                     |
| Inserir um lance forjado                              | Assinatura inválida e selo divergente                                   |
| Trocar o licitante real de um lance                   | Vínculo do pseudônimo não confere                                       |
| Trocar o líder ou o vencedor do lote                  | Estado do lote diverge da cadeia, e o selo e o comprovante não conferem |
| Empurrar o prazo final para aceitar lance tardio      | Selo não confere e a regra de prorrogação reproduzida diverge           |
| Alterar os termos (lance inicial, datas)              | Hash e assinatura da gênese não conferem                                |
| Alterar o comprovante depois da liquidação            | Hash e assinatura do comprovante não conferem                           |

Cada um desses cenários tem um teste de integração que altera o banco via SQL e confere o veredito.

### Como verificar por conta própria

- A página de auditoria mostra o resultado do servidor e **repete toda a verificação no navegador** (WebCrypto, com `@noble/ed25519` como alternativa em navegadores sem Ed25519), usando o mesmo código do pacote compartilhado. Se os dois discordarem, a página avisa.
- `GET /api/audit/public-key` publica a chave pública (Ed25519, formato JWK `x` e PEM) e o `keyId`.
- O botão **Baixar pacote de auditoria (JSON)** entrega todos os registros, sem dados pessoais, para conferência com qualquer ferramenta.

### Simulador de fraude

Para ver a detecção acontecendo, há um script que altera o banco diretamente, sem passar pela aplicação:

```bash
npm run build                                  # o script roda a partir do código compilado
npm run audit:tamper -- --list                 # lista lotes e modos disponíveis
npm run audit:tamper -- --lot <id> --mode update-amount --seq 2
```

Modos: `update-amount`, `delete-middle`, `delete-last`, `insert-fake`, `swap-bidder` e `extend-deadline`. Depois, abra `/auditoria/<id>`. O script se recusa a rodar em produção, a menos que `ALLOW_TAMPER=true`.

### Limites conhecidos (modelo de ameaça)

- **Quem tem o segredo de assinatura** (acesso às variáveis de ambiente do servidor) consegue reescrever o histórico com assinaturas válidas. Em produção real, a chave ficaria num KMS ou HSM, fora do alcance de quem administra o banco.
- **Reversão completa para um backup antigo** (todos os registros de um lote voltando juntos para um estado anterior válido) produz um histórico consistente e assinado. Para fechar essa porta, o próximo passo seria ancorar periodicamente os selos em um local externo e independente (por exemplo, um repositório público ou um serviço de carimbo de tempo).
- A chave pública vem do próprio servidor. Para uma conferência independente de verdade, compare o `keyId` com um valor anotado previamente.

## Privacidade

- **Pseudônimos por lote:** cada licitante aparece como um código de 6 caracteres (HMAC-SHA-256 do id do lote e do id do usuário com o segredo `PSEUDONYM_SECRET`). O mesmo licitante tem códigos diferentes em lotes diferentes, então não dá para cruzar participações. Na tela, os códigos aparecem como as "raquetes" numeradas de um leilão.
- **Nenhum nome ou e-mail** de licitante aparece na sala, na auditoria, no pacote JSON, no comprovante ou nos eventos públicos de tempo real. Os testes conferem isso.
- A interface marca os lances do próprio usuário como "você", com base na sessão, sem expor a identidade dos outros.
- Eventos privados (carteira, "você foi superado", "você arrematou") vão só para a sala do próprio usuário no WebSocket, autenticada pelo cookie.

## Resiliência à API externa

A API do museu é usada **só** na busca do painel e na criação do lote. Todo o resto funciona com a API fora do ar.

- **Snapshot no lote:** ao criar o lote, título, artista, atributos e a própria **imagem** são copiados para o PostgreSQL. Vitrine, sala, auditoria e comprovante leem só do banco. Se o download da imagem falhar, o lote é criado assim mesmo (com um placeholder borrado gerado a partir dos dados do museu) e uma rotina tenta copiar de novo a cada 30 minutos.
- **Cliente HTTP resiliente:** timeout, até 2 retentativas com backoff exponencial e jitter, respeito ao cabeçalho `Retry-After`, limitador de taxa (token bucket de 50 requisições por minuto, abaixo do limite de 60 do museu) e circuit breaker (abre após 3 falhas seguidas e testa de novo em 30 s).
- **Cache no banco com "stale-if-error":** buscas ficam frescas por 15 minutos e obras por 24 horas. Se a API falhar, a busca devolve o último resultado salvo, com aviso. Se aquela busca nunca foi feita, procura entre as obras que a casa já conhece (seed e buscas anteriores). Só sem nada conhecido responde 503, com uma mensagem clara.
- **Requisições idênticas simultâneas** compartilham a mesma chamada externa.
- `GET /api/health` informa o estado do banco e do circuit breaker (`degraded` quando a API externa está fora), sem derrubar a aplicação.
- Provedor `fake` (`CATALOG_PROVIDER=fake`) com as mesmas obras, para desenvolvimento offline e testes, inclusive simulação de queda.

## Como executar localmente

### Pré-requisitos

- **Node.js 22.12 ou superior** (há um `.nvmrc`) e npm 10.
- **PostgreSQL 14 ou superior** (testado no 16). O jeito mais simples é o Docker Desktop com o `docker-compose.yml` do projeto.

### Opção 1: tudo com Docker (mais rápido para avaliar)

```bash
docker compose up --build
```

Acesse http://localhost:3000. O Compose sobe o PostgreSQL e a aplicação já compilada; na primeira inicialização ela aplica as migrations e cria os dados de demonstração. Para parar: `Ctrl+C`; para apagar também o banco: `docker compose down -v`.

### Opção 2: ambiente de desenvolvimento

```bash
# 1. Dependências (na raiz do repositório)
npm install

# 2. Banco de dados: com Docker...
docker compose up -d db
#    ...ou use um PostgreSQL próprio e ajuste DATABASE_URL no .env

# 3. Variáveis de ambiente
cp .env.example .env            # no PowerShell: Copy-Item .env.example .env

# 4. Sobe API (porta 3000), front com hot reload (porta 5173) e o pacote compartilhado em modo watch
npm run dev
```

Acesse http://localhost:5173. As migrations rodam sozinhas quando a API sobe e, com `SEED_DEMO_DATA=true` (valor do `.env.example`), a seed roda se o banco estiver vazio. A documentação da API fica em http://localhost:3000/api/docs.

Sem Docker, crie o usuário e o banco no seu PostgreSQL (ou ajuste a `DATABASE_URL`):

```sql
CREATE USER arremate WITH PASSWORD 'arremate';
CREATE DATABASE arremate OWNER arremate;
CREATE DATABASE arremate_test OWNER arremate;  -- testes de integração
CREATE DATABASE arremate_e2e OWNER arremate;   -- testes ponta a ponta
```

Para rodar como em produção (API servindo o front compilado na porta 3000):

```bash
npm run build
npm start
```

> Dica para Windows: evite manter o projeto dentro de uma pasta sincronizada pelo OneDrive. A pasta `node_modules` tem dezenas de milhares de arquivos e a sincronização deixa a instalação lenta e pode travar arquivos.

### Scripts úteis (na raiz)

| Script                     | O que faz                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`              | Desenvolvimento: API, front e pacote compartilhado com recarga automática               |
| `npm run build`            | Compila pacote compartilhado, API e front                                               |
| `npm start`                | Sobe a aplicação compilada (API + front na mesma porta)                                 |
| `npm run db:migrate`       | Aplica migrations pendentes (requer build)                                              |
| `npm run db:seed`          | Cria os dados de demonstração se o banco estiver vazio (requer build)                   |
| `npm run db:reset`         | Apaga o esquema, recria e roda a seed (bloqueado em produção sem `ALLOW_DB_RESET=true`) |
| `npm run audit:tamper`     | Simulador de fraude direto no banco (ver [auditoria](#simulador-de-fraude))             |
| `npm test`                 | Testes unitários (pacote compartilhado, API e front)                                    |
| `npm run test:integration` | Testes de integração da API contra PostgreSQL                                           |
| `npm run test:e2e`         | Testes ponta a ponta com Playwright (requer build)                                      |
| `npm run test:all`         | Todos os testes                                                                         |
| `npm run lint`             | ESLint em todo o monorepo                                                               |
| `npm run typecheck`        | Checagem de tipos dos três pacotes                                                      |
| `npm run format`           | Formata o código com Prettier                                                           |

## Testes automatizados

| Camada                        | Ferramenta                   | Quantidade | O que cobre                                                                                                                                                                               |
| ----------------------------- | ---------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unidade: pacote compartilhado | Vitest                       | 41         | Regras de lance, prorrogação, conversão de valores e o verificador da auditoria contra cada tipo de adulteração                                                                           |
| Unidade: API                  | Jest                         | 31         | Configuração, criptografia da auditoria, cache "stale-if-error", circuit breaker, limitador e mapeamento da API do museu                                                                  |
| Unidade: front-end            | Vitest + Testing Library     | 19         | Painel de lance (mensagens, estados, valores), canal de tempo real, formatação e verificação da auditoria no navegador                                                                    |
| Integração: API + PostgreSQL  | Jest + Supertest + Socket.IO | 64         | Autenticação e papéis, carteira, regras de lance, concorrência, liquidação, cancelamento, auditoria contra SQL direto, tempo real e queda da API externa                                  |
| Ponta a ponta                 | Playwright (Chromium)        | 9          | Disputa entre dois licitantes sem recarregar, visitante, criação e cancelamento de lote, depósito, auditoria, comprovante, encerramento real com prorrogação e troca de sessão entre abas |

Os testes de integração sobem a aplicação Nest de verdade contra um PostgreSQL real e controlam o relógio (`Clock` injetável), o que permite testar prorrogação e liquidação sem esperar. O teste ponta a ponta de encerramento usa o relógio real: cria um lote de 65 segundos, dá um lance que cai na janela final, confirma a prorrogação e espera a sala anunciar "Você arrematou" sozinha (leva cerca de 2 minutos).

### Como rodar

```bash
npm test                    # unitários, não precisam de banco

# integração: precisa do banco arremate_test (o docker-compose já cria)
npm run test:integration

# ponta a ponta: precisa do banco arremate_e2e e do build
npm run build
npx playwright install chromium   # só na primeira vez
npm run test:e2e
```

Bancos diferentes podem ser apontados com `DATABASE_URL_TEST` e `E2E_DATABASE_URL`. Os testes apagam e recriam o esquema desses bancos, então nunca aponte para o banco principal.

### Integração contínua

O workflow `.github/workflows/ci.yml` roda a cada push e pull request, em quatro jobs paralelos: lint, formatação, tipos e testes unitários; integração com um serviço PostgreSQL; ponta a ponta com Playwright (o relatório é anexado em caso de falha); e build da imagem Docker.

## Deploy no Render + Neon

A aplicação roda como **um único Web Service** no Render (API, WebSocket e front na mesma origem) com o banco no **Neon**. Os dois têm plano gratuito.

### 1. Banco no Neon

1. Crie uma conta em https://neon.tech (dá para entrar com o GitHub).
2. Crie um projeto (por exemplo, `arremate`) na região **AWS US East 1 (N. Virginia)**, a mais próxima da região Virginia do Render.
3. No painel do projeto, clique em **Connect** e copie a connection string. Ela tem o formato `postgresql://usuario:senha@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`. Tanto a versão com pooler (host com `-pooler`) quanto a direta funcionam, porque a aplicação não usa recursos de sessão do PostgreSQL.

### 2. Aplicação no Render (Blueprint)

1. Publique o repositório no GitHub.
2. Crie uma conta em https://render.com (também dá para entrar com o GitHub).
3. Clique em **New > Blueprint** e selecione o repositório. O Render lê o `render.yaml` e mostra o serviço `arremate`.
4. Cole a connection string do Neon em `DATABASE_URL`. Os segredos `JWT_SECRET`, `AUDIT_SIGNING_SECRET` e `PSEUDONYM_SECRET` são gerados automaticamente.
5. Confirme. O primeiro build leva alguns minutos. Na primeira inicialização a aplicação aplica as migrations e cria os dados de demonstração.
6. Acesse o endereço `https://<nome>.onrender.com` e confira `https://<nome>.onrender.com/api/health`.

Deploys seguintes acontecem sozinhos a cada push na branch principal. A seed não roda de novo, porque o banco já tem dados.

### Alternativa: Web Service manual

Em **New > Web Service**, escolha o repositório e preencha:

| Campo             | Valor                                   |
| ----------------- | --------------------------------------- |
| Runtime           | Node                                    |
| Build Command     | `npm ci --include=dev && npm run build` |
| Start Command     | `node apps/api/dist/main.js`            |
| Health Check Path | `/api/health/live`                      |
| Instance Type     | Free                                    |

Variáveis de ambiente: `NODE_ENV=production`, `NODE_VERSION=22`, `DATABASE_URL` (do Neon), `JWT_SECRET`, `AUDIT_SIGNING_SECRET` e `PSEUDONYM_SECRET` (valores longos e aleatórios, por exemplo gerados com `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) e `SEED_DEMO_DATA=true`.

### Cuidados

- **Nunca troque `AUDIT_SIGNING_SECRET` nem `PSEUDONYM_SECRET` depois que houver lances.** As assinaturas e os pseudônimos antigos deixam de conferir e a auditoria passa a acusar todos os lotes antigos. `JWT_SECRET` pode ser trocado: só desconecta quem estiver logado.
- Para voltar a demonstração ao estado inicial em produção, rode `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` no **SQL Editor** do Neon e reinicie o serviço no Render (ou faça um novo deploy). Na inicialização a aplicação recria as tabelas e a seed, já com os segredos de produção. Evite rodar `npm run db:reset` do seu computador contra o banco de produção: sem as mesmas variáveis `AUDIT_SIGNING_SECRET` e `PSEUDONYM_SECRET` do Render, os dados nasceriam assinados com outra chave e a auditoria acusaria todos os lotes.
- `ARTIC_CONTACT` (opcional) identifica a aplicação para o museu no cabeçalho `AIC-User-Agent`, como pede a documentação da API. Pode ser a URL do repositório.

## Variáveis de ambiente

Todas têm padrão para desenvolvimento; a lista completa e comentada está em [`.env.example`](.env.example).

| Variável                                                         | Padrão                                                 | Descrição                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                       | `development`                                          | `production` exige os segredos, liga cookie `Secure` e `trust proxy`                                  |
| `PORT`                                                           | `3000`                                                 | Porta HTTP (o Render define a sua)                                                                    |
| `DATABASE_URL`                                                   | `postgres://arremate:arremate@localhost:5432/arremate` | Conexão com o PostgreSQL                                                                              |
| `DATABASE_SSL`                                                   | `auto`                                                 | `auto` segue o `sslmode` da URL; `true` ou `false` forçam                                             |
| `DATABASE_POOL_MAX`                                              | `10`                                                   | Tamanho máximo do pool de conexões                                                                    |
| `JWT_SECRET`                                                     | fixo para desenvolvimento                              | Assina o cookie de sessão (obrigatório em produção, 16+ caracteres)                                   |
| `AUDIT_SIGNING_SECRET`                                           | fixo para desenvolvimento                              | Deriva a chave Ed25519 da auditoria (obrigatório em produção; nunca trocar depois de haver lances)    |
| `PSEUDONYM_SECRET`                                               | fixo para desenvolvimento                              | Gera os pseudônimos (obrigatório em produção; nunca trocar depois de haver lances)                    |
| `JWT_EXPIRES_IN_HOURS`                                           | `168`                                                  | Duração da sessão                                                                                     |
| `COOKIE_SECURE`                                                  | `true` em produção                                     | Use `false` para rodar em `http://localhost` com `NODE_ENV=production`                                |
| `TRUST_PROXY`                                                    | `true` em produção                                     | Necessário atrás do proxy do Render para identificar o IP real                                        |
| `ALLOWED_ORIGINS`                                                | vazio                                                  | Origens extras liberadas (CORS e CSRF), separadas por vírgula. Só se o front estiver em outro domínio |
| `SEED_DEMO_DATA`                                                 | `false`                                                | Cria os dados de demonstração na inicialização se o banco estiver vazio                               |
| `CATALOG_PROVIDER`                                               | `artic`                                                | `fake` usa um catálogo local com as mesmas obras                                                      |
| `ARTIC_API_URL`                                                  | `https://api.artic.edu/api/v1`                         | Endereço da API do museu                                                                              |
| `ARTIC_CONTACT`                                                  | vazio                                                  | Contato opcional enviado ao museu                                                                     |
| `CATALOG_TIMEOUT_MS`                                             | `6000`                                                 | Timeout de cada chamada à API do museu                                                                |
| `IMAGE_DOWNLOAD_ENABLED`                                         | `true`                                                 | Copia a imagem de cada lote para o banco                                                              |
| `ANTI_SNIPING_WINDOW_SECONDS` / `ANTI_SNIPING_EXTENSION_SECONDS` | `120` / `120`                                          | Janela final e extensão da prorrogação (gravadas em cada lote novo)                                   |
| `SCHEDULER_ENABLED`                                              | `true`                                                 | Liga o agendador de liquidação                                                                        |
| `RATE_LIMIT_ENABLED`                                             | `true`                                                 | Liga o limite de requisições por IP                                                                   |
| `SWAGGER_ENABLED`                                                | `true`                                                 | Publica a documentação em `/api/docs`                                                                 |
| `WEB_DIST_PATH`                                                  | `apps/web/dist`                                        | Pasta do front compilado servida pela API                                                             |

## Referência da API

A documentação completa e interativa fica em `/api/docs` (Swagger). Resumo:

| Método e rota                          | Acesso      | Descrição                                                                       |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `POST /api/auth/register`              | público     | Cadastro (nome, e-mail, senha, perfil)                                          |
| `POST /api/auth/login`                 | público     | Login; define o cookie de sessão e devolve também o token                       |
| `POST /api/auth/logout`                | público     | Encerra a sessão                                                                |
| `GET /api/auth/me`                     | público     | Usuário da sessão (ou `null`)                                                   |
| `GET /api/lots`                        | público     | Vitrine: `tab` (`live`, `scheduled`, `closed`), `q`, `sort`, `page`, `pageSize` |
| `GET /api/lots/:id`                    | público     | Sala do lote; com sessão, inclui a posição do usuário                           |
| `GET /api/lots/:id/bids`               | público     | Histórico de lances (pseudônimos)                                               |
| `POST /api/lots`                       | leiloeiro   | Cria lote a partir de um item do catálogo                                       |
| `POST /api/lots/:id/cancel`            | leiloeiro   | Cancela o lote (com estorno automático, se houver lances)                       |
| `POST /api/lots/:id/bids`              | licitante   | Dá um lance (`amountCents`)                                                     |
| `GET /api/auctioneer/dashboard`        | leiloeiro   | Lotes do leiloeiro, resultados e total recebido                                 |
| `GET /api/me/bids`                     | licitante   | Meus arremates                                                                  |
| `GET /api/wallet`                      | autenticado | Saldos e extrato                                                                |
| `POST /api/wallet/deposits`            | licitante   | Depósito simulado                                                               |
| `GET /api/catalog/search`              | leiloeiro   | Busca no acervo do museu (`q`, `page`)                                          |
| `GET /api/catalog/items/:id`           | leiloeiro   | Detalhe de uma obra                                                             |
| `GET /api/catalog/status`              | público     | Estado do circuit breaker da API externa                                        |
| `GET /api/receipts/:code`              | público     | Comprovante de arremate                                                         |
| `GET /api/audit/lots/:id`              | público     | Pacote de auditoria e resultado da verificação                                  |
| `GET /api/audit/public-key`            | público     | Chave pública Ed25519 da auditoria                                              |
| `GET /api/images/:id`                  | público     | Imagem do lote guardada no banco                                                |
| `GET /api/health` e `/api/health/live` | público     | Saúde completa (banco e API externa) e checagem leve para o Render              |

Erros seguem o formato `{ statusCode, code, message, details? }`, com mensagens em português.

### Tempo real (Socket.IO, caminho `/socket.io`)

| Evento                              | Direção               | Conteúdo                                                                                     |
| ----------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `lot:subscribe` / `lot:unsubscribe` | cliente para servidor | Entrar ou sair da sala de um lote (aberta a visitantes)                                      |
| `lot:bid`                           | sala do lote          | Novo lance, preço atual, próximo mínimo, novo prazo, se houve prorrogação e hora do servidor |
| `lot:closed` / `lot:cancelled`      | sala do lote          | Encerramento (com pseudônimo do vencedor e valor) ou cancelamento                            |
| `wallet:updated`                    | só o usuário          | Novos saldos e o motivo da mudança                                                           |
| `bid:outbid`                        | só o usuário          | Você foi superado (lote, valor novo e mínimo para voltar à liderança)                        |
| `lot:won` / `lot:sold`              | só o usuário          | Arremate (com código do comprovante) e venda para o leiloeiro                                |

A sala usa a hora do servidor que vem em cada evento para corrigir a contagem regressiva, então um relógio errado no computador do usuário não altera o que ele vê.

## Comportamentos que podem surpreender

- **Primeiro acesso lento no deploy.** O Render gratuito hiberna o serviço após 15 minutos sem acesso e leva de 30 a 60 segundos para acordar. O Neon também suspende o banco depois de alguns minutos ocioso, mas volta em menos de um segundo.
- **Lotes que vencem enquanto o servidor hiberna** são liquidados assim que ele acorda (na inicialização e ao abrir a sala). Os avisos em tempo real chegam só para quem está com a página aberta naquele momento; o resultado aparece em Meus arremates, no painel e no comprovante.
- **Uma sessão por navegador.** Abas do mesmo navegador compartilham o cookie, e as janelas anônimas compartilham outro entre si. Para simular dois licitantes, use uma janela normal e uma anônima, ou dois navegadores. Se você trocar de conta em uma aba, as outras abas se atualizam e avisam.
- **O lote 3 aparece como "Histórico adulterado" de propósito.** É a demonstração da auditoria.
- **As datas da seed são relativas** ao momento em que o banco foi populado (primeiro deploy). Por isso "Abre em 2 dias" se refere a esse momento.
- **A busca no acervo é em inglês**, que é a língua do catálogo do museu ("Monet", "Hokusai", "portrait", "landscape"). Só aparecem obras em domínio público e com imagem.
- **Se a API do museu estiver fora do ar ou lenta,** a busca mostra um aviso e usa resultados salvos. Lotes existentes não são afetados. Se a cópia da imagem falhar na criação, a imagem é carregada direto do museu até a nova tentativa funcionar.
- **Horários aparecem no fuso do navegador**; o servidor trabalha em UTC.
- **A prorrogação conta a partir do lance**, não do fim anterior (ver a [interpretação](#prorrogação-anti-sniping)).
- **Um lance no instante exato do fim é recusado** como "encerrado": os lances valem do início (inclusive) ao fim (exclusive).
- **Limites de requisições por IP:** 300 por minuto no geral, 10 por minuto para login e cadastro e 60 por minuto para lances. Acima disso a API responde 429 com mensagem.
- **Depósito simulado:** nenhum pagamento real acontece. O limite é de R$ 1.000.000,00 por depósito. Leiloeiros não depositam: recebem o valor das vendas.
- **Lotes têm duração entre 1 minuto e 60 dias** e podem ser agendados para começar em até 180 dias.

## Limitações e próximos passos

- **Mais de uma instância:** a liquidação já é segura com várias instâncias, mas os eventos do Socket.IO ficam na memória do processo. Para escalar horizontalmente, o próximo passo é o adapter do Redis (ou do PostgreSQL) no Socket.IO.
- **Gestão da chave de assinatura:** usar KMS ou HSM e rotação de chaves. O formato já guarda o `keyId` em cada registro, o que permite conviver com chaves antigas.
- **Ancoragem externa dos selos** para fechar o risco de reversão completa a um backup antigo.
- **Fora do escopo, como o desafio permite:** recuperação de senha, confirmação de e-mail, notas fiscais, revenda, pagamentos reais e app nativo.

## Uso de IA

O desenvolvimento contou com assistência de IA. O detalhamento de onde e como foi usada, e do que foi revisado e ajustado, está em [`docs/USO-DE-IA.md`](docs/USO-DE-IA.md).

## Estrutura de pastas

```
.
├── apps/
│   ├── api/                    NestJS
│   │   ├── src/
│   │   │   ├── common/         relógio injetável, erros, transações com retentativa
│   │   │   ├── config/         configuração validada (zod)
│   │   │   ├── database/       entidades, migration e scripts de linha de comando
│   │   │   ├── modules/
│   │   │   │   ├── auction/    lotes, lances, liquidação, agendador, comprovantes
│   │   │   │   ├── audit/      assinatura Ed25519, pseudônimos, auditoria
│   │   │   │   ├── auth/       cadastro, login, guards e papéis
│   │   │   │   ├── catalog/    API do museu, cache, circuit breaker, limitador
│   │   │   │   ├── images/     cópia das imagens para o banco
│   │   │   │   ├── realtime/   Socket.IO
│   │   │   │   ├── wallet/     carteira e extrato
│   │   │   │   └── health/
│   │   │   └── seed/           dados de demonstração
│   │   └── test/integration/   testes contra PostgreSQL real
│   └── web/                    React + Vite
│       └── src/
│           ├── auth/  components/  hooks/  lib/  pages/  styles/
├── packages/shared/            regras, contratos e verificador da auditoria
├── e2e/                        testes Playwright
├── docker/                     script de criação dos bancos de teste
├── docs/                       documentação complementar
├── .github/workflows/ci.yml    integração contínua
├── Dockerfile  docker-compose.yml  render.yaml  .env.example
```
