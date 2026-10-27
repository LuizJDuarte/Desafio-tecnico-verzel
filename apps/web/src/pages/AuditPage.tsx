import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CircleCheck, CircleX, Download, Link2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatBRL, type AuditCheck, type AuditIssue, type AuditReport, type AuditResponse } from '@arremate/shared';
import { ArtworkImage } from '../components/ArtworkImage';
import { Paddle } from '../components/Paddle';
import { Button, ErrorState, LinkButton, PageLoading } from '../components/ui';
import { ApiError } from '../lib/api';
import { verifyInBrowser, type VerificationEngine } from '../lib/audit-verify';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';
import { useAudit } from '../lib/queries';

type BrowserResult =
  | { state: 'running' }
  | { state: 'done'; report: AuditReport; engine: VerificationEngine }
  | { state: 'failed'; message: string };

const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

function useBrowserVerification(data: AuditResponse | undefined): BrowserResult {
  const [result, setResult] = useState<BrowserResult>({ state: 'running' });
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setResult({ state: 'running' });
    verifyInBrowser(data.bundle, data.publicKey)
      .then(({ report, engine }) => !cancelled && setResult({ state: 'done', report, engine }))
      .catch((error: Error) => !cancelled && setResult({ state: 'failed', message: error.message }));
    return () => {
      cancelled = true;
    };
  }, [data]);
  return result;
}

function CheckRow({ check }: { check: AuditCheck }) {
  return (
    <li className="flex gap-3 py-3">
      {check.ok ? (
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-win" aria-label="Aprovado" />
      ) : (
        <CircleX className="mt-0.5 size-5 shrink-0 text-lose" aria-label="Reprovado" />
      )}
      <div>
        <p className="font-semibold">{check.label}</p>
        <p className="text-[15px] text-ink-soft">{check.detail}</p>
      </div>
    </li>
  );
}

function downloadBundle(data: AuditResponse) {
  const blob = new Blob([JSON.stringify({ bundle: data.bundle, publicKey: data.publicKey }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `auditoria-lote-${data.lot.number}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AuditPage() {
  const { id = '' } = useParams();
  const audit = useAudit(id);
  const browser = useBrowserVerification(audit.data);

  const issuesBySeq = useMemo(() => {
    const map = new Map<number, AuditIssue[]>();
    for (const issue of audit.data?.report.issues ?? []) {
      if (issue.seq === undefined) continue;
      map.set(issue.seq, [...(map.get(issue.seq) ?? []), issue]);
    }
    return map;
  }, [audit.data]);

  if (audit.isPending) return <PageLoading label="Verificando o histórico" />;
  if (audit.isError) {
    const missing = audit.error instanceof ApiError && (audit.error.status === 404 || audit.error.status === 400);
    return (
      <ErrorState
        title={missing ? 'Lote não encontrado' : 'Não foi possível auditar'}
        message={missing ? 'Confira o link da auditoria.' : audit.error.message}
        action={<LinkButton to="/">Voltar para a vitrine</LinkButton>}
      />
    );
  }

  const data = audit.data;
  const { report, bundle } = data;
  const intact = report.verdict === 'INTACT';
  const browserReport = browser.state === 'done' ? browser.report : null;
  const disagree =
    browserReport &&
    browserReport.verdict !== report.verdict &&
    report.issues.some((issue) => issue.check !== 'IDENTITIES');
  const identityCheck = report.checks.find((check) => check.id === 'IDENTITIES');
  const checks = [
    ...(browserReport?.checks ?? report.checks.filter((check) => check.id !== 'IDENTITIES')),
    ...(identityCheck ? [identityCheck] : []),
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Link to={`/lotes/${data.lot.id}`} className="w-28 shrink-0" aria-label="Abrir a sala do lote">
          <ArtworkImage image={data.lot.image} title={data.lot.title} className="aspect-square w-28" thumb />
        </Link>
        <div>
          <h1 className="font-serif text-[clamp(1.9rem,3.6vw,2.8rem)] leading-tight">
            Auditoria do lote {data.lot.number}
          </h1>
          <p className="mt-1 text-ink-soft">
            {data.lot.artist && <span className="font-semibold text-ink">{data.lot.artist}, </span>}
            <span className="title-art text-[17px]">{data.lot.title}</span>
          </p>
          <p className="mt-1 text-sm text-ink-faint">Página pública: qualquer pessoa pode conferir, sem login.</p>
        </div>
      </div>

      {/* Veredito */}
      <section
        aria-live="polite"
        className={cn('rounded-xl border-2 p-6 sm:p-8', intact ? 'border-win bg-win-soft' : 'border-lose bg-lose-soft')}
      >
        <div className="flex items-start gap-4">
          {intact ? (
            <ShieldCheck className="size-10 shrink-0 text-win" aria-hidden />
          ) : (
            <ShieldAlert className="size-10 shrink-0 text-lose" aria-hidden />
          )}
          <div>
            <p className={cn('font-serif text-3xl leading-tight sm:text-4xl', intact ? 'text-win' : 'text-lose')}>
              {intact ? 'Histórico íntegro' : 'Histórico adulterado'}
            </p>
            <p className="mt-2 max-w-[65ch] text-[17px] text-ink">
              {intact
                ? `Os ${report.bidCount} lance(s) deste lote estão exatamente como foram registrados: nenhuma alteração, remoção ou inserção posterior.`
                : `Encontramos ${report.issues.length} problema(s). Registros deste lote foram alterados fora do sistema depois de gravados.`}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-1.5">
                {intact ? (
                  <CircleCheck className="size-4 text-win" aria-hidden />
                ) : (
                  <CircleX className="size-4 text-lose" aria-hidden />
                )}
                Servidor: {intact ? 'íntegro' : 'adulterado'} ({formatDateTime(data.verifiedAt)})
              </span>
              <span className="flex items-center gap-1.5">
                {browser.state === 'running' && 'Seu navegador: verificando…'}
                {browser.state === 'failed' && <>Seu navegador: {browser.message}</>}
                {browserReport && (
                  <>
                    {browserReport.verdict === 'INTACT' ? (
                      <CircleCheck className="size-4 text-win" aria-hidden />
                    ) : (
                      <CircleX className="size-4 text-lose" aria-hidden />
                    )}
                    Seu navegador: {browserReport.verdict === 'INTACT' ? 'íntegro' : 'adulterado'} (
                    {browser.state === 'done' && browser.engine === 'webcrypto' ? 'WebCrypto' : 'noble-ed25519'}, sem
                    confiar no servidor)
                  </>
                )}
              </span>
            </div>
            {disagree && (
              <p className="mt-3 text-sm font-semibold text-lose">
                A verificação local discorda da do servidor. Desconfie deste resultado e baixe o pacote para conferir.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-8">
          <section aria-labelledby="verificacoes">
            <h2 id="verificacoes" className="font-semiwide text-lg font-bold">
              O que foi verificado
            </h2>
            <ul className="mt-2 divide-y divide-line">
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </ul>
          </section>

          {report.issues.length > 0 && (
            <section aria-labelledby="problemas" className="rounded-xl border border-lose/50 bg-surface p-5">
              <h2 id="problemas" className="font-semiwide text-lg font-bold text-lose">
                Problemas encontrados
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px]">
                {report.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            </section>
          )}

          <details className="rounded-xl border border-line bg-surface p-5">
            <summary className="cursor-pointer font-semibold">Como esta auditoria funciona</summary>
            <div className="mt-3 space-y-3 text-[15px] text-ink-soft">
              <p>
                Cada lance guarda o hash SHA-256 do registro anterior, formando uma cadeia que começa nos termos do lote
                (gênese). Mudar, apagar ou inserir qualquer registro quebra a cadeia.
              </p>
              <p>
                Como qualquer pessoa conseguiria recalcular hashes, cada registro também é assinado com uma chave
                Ed25519 que fica só na configuração do servidor, nunca no banco. Quem altera o banco não consegue
                produzir assinaturas válidas.
              </p>
              <p>
                O selo assinado do lote guarda quantos lances existem e qual é o último, então até a remoção do lance
                mais recente é detectada. Por fim, as regras do leilão são reproduzidas lance a lance.
              </p>
              <p>
                Os licitantes aparecem só por pseudônimo, derivado com HMAC: diferente em cada lote e impossível de
                reverter sem o segredo do servidor.
              </p>
            </div>
          </details>

          <section className="space-y-3 text-sm">
            <p className="text-ink-faint">Chave pública ({data.publicKey.algorithm})</p>
            <p className="break-all font-mono text-[13px] text-ink-soft">{data.publicKey.publicKey}</p>
            <p className="text-ink-faint">
              Identificador: <span className="font-mono text-ink-soft">{data.publicKey.keyId}</span>
            </p>
            <Button variant="secondary" size="sm" onClick={() => downloadBundle(data)}>
              <Download className="size-4" aria-hidden />
              Baixar pacote de auditoria (JSON)
            </Button>
          </section>
        </div>

        {/* Cadeia de registros */}
        <section aria-labelledby="cadeia">
          <h2 id="cadeia" className="font-semiwide text-lg font-bold">
            Cadeia de registros
          </h2>
          <p className="text-[15px] text-ink-soft">Do registro mais antigo (termos do lote) ao selo atual.</p>
          <ol className="mt-4 space-y-3">
            <li className="rounded-lg border border-line bg-surface p-4">
              <p className="font-semibold">Gênese: termos do lote</p>
              <p className="mt-1 text-sm text-ink-soft">
                Lance inicial {formatBRL(bundle.lot.startingPriceCents)}, incremento{' '}
                {formatBRL(bundle.lot.minIncrementCents)}, de {formatDateTime(bundle.lot.startsAt)} a{' '}
                {formatDateTime(bundle.lot.originalEndsAt)}
              </p>
              <p className="mt-2 font-mono text-[12px] text-ink-faint">hash {short(bundle.lot.genesisHash)}</p>
            </li>
            {bundle.bids.map((bid) => {
              const issues = issuesBySeq.get(bid.seq) ?? [];
              return (
                <li
                  key={`${bid.seq}-${bid.hash}`}
                  className={cn(
                    'rounded-lg border p-4',
                    issues.length ? 'border-lose bg-lose-soft' : 'border-line bg-surface',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-10 font-semibold tabular text-ink-faint">#{bid.seq}</span>
                    <Paddle alias={bid.bidderAlias} tone={issues.length ? 'lose' : 'muted'} />
                    <span className="font-semiwide font-bold tabular">{formatBRL(bid.amountCents)}</span>
                    <span className="text-sm text-ink-faint">{formatDateTime(bid.createdAt)}</span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 font-mono text-[12px] text-ink-faint">
                    <Link2 className="size-3.5" aria-hidden />
                    anterior {short(bid.prevHash)}
                  </p>
                  <p className="font-mono text-[12px] text-ink-faint">hash {short(bid.hash)}</p>
                  {issues.map((issue, index) => (
                    <p key={index} className="mt-2 text-sm font-semibold text-lose">
                      {issue.message}
                    </p>
                  ))}
                </li>
              );
            })}
            <li className="rounded-lg border border-dashed border-line-strong p-4">
              <p className="font-semibold">Selo do lote</p>
              <p className="mt-1 text-sm text-ink-soft">
                {bundle.lot.bidCount} lance(s), situação{' '}
                {bundle.lot.state === 'OPEN' ? 'aberta' : bundle.lot.state === 'SETTLED' ? 'liquidada' : 'cancelada'},
                fim em {formatDateTime(bundle.lot.endsAt)}
              </p>
              <p className="mt-2 font-mono text-[12px] text-ink-faint">aponta para {short(bundle.lot.headHash)}</p>
            </li>
            {bundle.receipt && (
              <li className="rounded-lg border border-win/60 bg-win-soft p-4">
                <p className="font-semibold">Comprovante nº {String(bundle.receipt.number).padStart(6, '0')}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Arrematado por <Paddle alias={bundle.receipt.winnerAlias} tone="win" className="mx-1" /> por{' '}
                  {formatBRL(bundle.receipt.amountCents)}
                </p>
                <Link
                  to={`/comprovante/${bundle.receipt.code}`}
                  className="mt-2 inline-block text-sm font-semibold text-brand-text hover:underline"
                >
                  Ver comprovante
                </Link>
              </li>
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}
