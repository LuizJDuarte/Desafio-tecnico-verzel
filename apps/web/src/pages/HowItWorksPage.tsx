import { Link } from 'react-router';
import { Paddle } from '../components/Paddle';

const RULES: Array<{ title: string; body: string }> = [
  {
    title: 'Só lotes ao vivo aceitam lances',
    body: 'Entre o horário de início e o de encerramento. Antes disso o lote aparece como agendado; depois, como encerrado.',
  },
  {
    title: 'Valor mínimo',
    body: 'O primeiro lance precisa ser pelo menos o lance inicial. Cada lance seguinte precisa ser pelo menos o lance atual mais o incremento mínimo do lote.',
  },
  {
    title: 'Quem lidera não cobre o próprio lance',
    body: 'Se você já é o líder, espere alguém superar você antes de dar um novo lance.',
  },
  {
    title: 'O lance precisa caber no saldo disponível',
    body: 'Disponível é o saldo total menos o valor comprometido. Enquanto você lidera um lote, o valor do seu lance fica comprometido; se alguém cobrir, ele volta ao disponível na hora.',
  },
  {
    title: 'Prorrogação contra lances de última hora',
    body: 'Um lance aceito nos últimos 2 minutos estende o encerramento para 2 minutos depois dele. Assim todos têm tempo de responder.',
  },
  {
    title: 'Liquidação no encerramento',
    body: 'Quando o lote termina, o valor é debitado do vencedor e creditado ao leiloeiro, e o comprovante de arremate é emitido. Lotes sem lances fecham sem vencedor.',
  },
];

export function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-[72ch] space-y-12">
      <div>
        <h1 className="font-serif text-[clamp(2rem,4vw,2.9rem)] leading-tight">Como funciona</h1>
        <p className="mt-3 text-[17px] text-ink-soft">
          O leiloeiro escolhe uma obra no acervo aberto do Art Institute of Chicago, define lance inicial, incremento e
          horários, e publica o lote. Licitantes depositam um saldo simulado e disputam ao vivo.
        </p>
      </div>

      <section aria-labelledby="regras" className="space-y-6">
        <h2 id="regras" className="font-semiwide text-xl font-bold">
          Regras de lance
        </h2>
        <dl className="space-y-5">
          {RULES.map((rule) => (
            <div key={rule.title} className="border-l-[3px] border-brand pl-4">
              <dt className="font-semibold">{rule.title}</dt>
              <dd className="mt-1 text-ink-soft">{rule.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="privacidade" className="space-y-3">
        <h2 id="privacidade" className="font-semiwide text-xl font-bold">
          Seu número em cada lote
        </h2>
        <div className="flex items-center gap-4">
          <Paddle alias="7ADF93" tone="win" size="md" />
          <Paddle alias="B3A856" tone="lose" size="md" />
          <Paddle alias="51C0E2" tone="muted" size="md" />
        </div>
        <p className="text-ink-soft">
          Como as raquetes numeradas de um salão de leilões, cada licitante aparece por um código, nunca pelo nome ou
          e-mail. O código muda de um lote para outro, então ninguém consegue acompanhar o que você disputa.
        </p>
      </section>

      <section aria-labelledby="auditoria" className="space-y-3">
        <h2 id="auditoria" className="font-semiwide text-xl font-bold">
          Histórico que não pode ser adulterado em silêncio
        </h2>
        <p className="text-ink-soft">
          Cada lance aponta para o anterior por um hash SHA-256 e é assinado digitalmente (Ed25519) com uma chave que
          fica fora do banco de dados. Qualquer alteração, remoção ou inserção posterior, mesmo feita direto no banco,
          aparece na página de auditoria do lote, que é pública e refaz toda a verificação também no seu navegador.
        </p>
        <p className="text-ink-soft">
          Para ver a detecção funcionando, há um lote de demonstração cujo lance foi alterado de propósito direto no
          banco: procure por "Moulin Rouge" nos{' '}
          <Link to="/?aba=closed" className="font-semibold text-brand-text hover:underline">
            lotes encerrados
          </Link>{' '}
          e abra a auditoria.
        </p>
      </section>

      <section aria-labelledby="api" className="space-y-3">
        <h2 id="api" className="font-semiwide text-xl font-bold">
          Quando a API do museu cai
        </h2>
        <p className="text-ink-soft">
          Os dados e a imagem de cada obra são copiados para o leilão na criação do lote. Vitrine, salas, auditoria e
          comprovantes não dependem da API externa. Só a busca de novas obras depende dela, e mesmo assim ela usa as
          últimas respostas salvas quando o museu está fora do ar.
        </p>
      </section>
    </div>
  );
}
