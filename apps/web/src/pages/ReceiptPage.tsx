import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Check, Copy, Printer, Share2, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL, type PublicKeyDto } from '@arremate/shared';
import { ArtworkImage } from '../components/ArtworkImage';
import { Paddle } from '../components/Paddle';
import { Button, ErrorState, LinkButton, PageLoading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { verifyReceiptInBrowser } from '../lib/audit-verify';
import { formatDateTime } from '../lib/format';
import { useReceipt } from '../lib/queries';

export function ReceiptPage() {
  const { code = '' } = useParams();
  const receipt = useReceipt(code);
  const [copied, setCopied] = useState(false);

  const signature = useQuery({
    queryKey: ['receipt-signature', code],
    enabled: Boolean(receipt.data),
    queryFn: async () => {
      const key = await api<PublicKeyDto>('/audit/public-key');
      return verifyReceiptInBrowser(receipt.data!, key);
    },
    retry: false,
  });

  if (receipt.isPending) return <PageLoading label="Carregando o comprovante" />;
  if (receipt.isError) {
    const missing = receipt.error instanceof ApiError && (receipt.error.status === 404 || receipt.error.status === 400);
    return (
      <ErrorState
        title={missing ? 'Comprovante não encontrado' : 'Não foi possível abrir o comprovante'}
        message={missing ? 'Confira se o link foi copiado por inteiro.' : receipt.error.message}
        action={<LinkButton to="/">Ir para a vitrine</LinkButton>}
      />
    );
  }

  const data = receipt.data;
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const number = String(data.number).padStart(6, '0');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link do comprovante copiado.');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Não foi possível copiar. Selecione o endereço na barra do navegador.');
    }
  };

  const share = async () => {
    try {
      await navigator.share({
        title: `Comprovante de arremate nº ${number}`,
        text: `Arrematei "${data.lot.title}" no Arremate.`,
        url,
      });
    } catch {
      // usuário cancelou o compartilhamento
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {data.viewerIsWinner && (
        <p className="no-print rounded-lg bg-win-soft px-4 py-3 text-[15px]">
          Este comprovante é seu. Compartilhe o link: quem abrir vê o arremate, mas não o seu nome nem o seu e-mail.
        </p>
      )}

      <article className="overflow-hidden rounded-xl border border-line-strong bg-raised">
        <header className="flex flex-col gap-2 border-b border-line px-6 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <div>
            <p className="font-semiwide text-sm font-bold text-ink-faint">Arremate, casa de leilões</p>
            <h1 className="font-serif text-3xl sm:text-4xl">Comprovante de arremate</h1>
          </div>
          <p className="font-wide text-lg font-bold tabular text-ink-soft">Nº {number}</p>
        </header>

        <div className="grid gap-8 px-6 py-8 sm:px-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <ArtworkImage image={data.lot.image} title={data.lot.title} className="aspect-[4/5] w-full" eager />
          <div className="flex flex-col">
            <p className="text-sm font-semibold text-ink-faint">Lote {data.lot.number}</p>
            {data.lot.artist && <p className="text-lg font-semibold">{data.lot.artist}</p>}
            <p className="title-art text-2xl leading-snug">{data.lot.title}</p>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-6">
              <div className="col-span-2">
                <dt className="text-sm text-ink-faint">Valor do arremate</dt>
                <dd className="font-wide text-4xl font-extrabold tabular">{formatBRL(data.amountCents)}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-faint">Arrematante</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <Paddle alias={data.winnerAlias} tone="win" size="md" />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-faint">Leiloeiro</dt>
                <dd className="mt-1">{data.sellerName}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-faint">Encerramento</dt>
                <dd>{formatDateTime(data.closedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-faint">Emitido em</dt>
                <dd>{formatDateTime(data.issuedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-faint">Lances no lote</dt>
                <dd className="tabular">{data.bidCount}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-faint">Origem da obra</dt>
                <dd>
                  <a href={data.lot.source.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {data.lot.source.providerName}
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <footer className="grid gap-6 border-t border-line bg-surface px-6 py-6 sm:px-8 md:grid-cols-[auto_1fr]">
          <div className="justify-self-start rounded-md bg-white p-2">
            <QRCodeSVG value={url} size={112} level="M" aria-label="QR code com o link deste comprovante" />
          </div>
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              {signature.isPending && <span className="text-ink-faint">Conferindo a assinatura digital…</span>}
              {signature.data === true && (
                <>
                  <ShieldCheck className="size-5 text-win" aria-hidden />
                  <span className="text-win">Assinatura digital válida (conferida no seu navegador)</span>
                </>
              )}
              {(signature.data === false || signature.isError) && (
                <>
                  <ShieldX className="size-5 text-lose" aria-hidden />
                  <span className="text-lose">Assinatura inválida: este comprovante foi alterado</span>
                </>
              )}
            </p>
            <p className="break-all font-mono text-[12px] text-ink-faint">sha-256 {data.payloadHash}</p>
            <p className="break-all font-mono text-[12px] text-ink-faint">último lance {data.headHash}</p>
            <Link
              to={`/auditoria/${data.lot.id}`}
              className="inline-block font-semibold text-brand-text hover:underline"
            >
              Auditar o histórico completo do lote
            </Link>
          </div>
        </footer>
      </article>

      <div className="no-print flex flex-wrap gap-2">
        <Button variant="secondary" onClick={copyLink}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? 'Link copiado' : 'Copiar link'}
        </Button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <Button variant="secondary" onClick={share}>
            <Share2 className="size-4" aria-hidden />
            Compartilhar
          </Button>
        )}
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          Imprimir
        </Button>
      </div>
    </div>
  );
}
