import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../config/app-config';
import { createDataSource } from '../data-source';
import { parseArgs } from './cli-context';

const MODES = {
  'update-amount': 'altera o valor de um lance (padrão: o primeiro)',
  'delete-middle': 'apaga um lance do meio do histórico',
  'delete-last': 'apaga o último lance (e não mexe no lote)',
  'insert-fake': 'insere um lance forjado no final, com hash correto mas sem assinatura válida',
  'swap-bidder': 'troca o licitante real de um lance por outro usuário',
  'extend-deadline': 'empurra o prazo final do lote em 1 hora',
} as const;

type Mode = keyof typeof MODES;

/**
 * SIMULADOR DE FRAUDE (somente para demonstração/avaliação).
 * Altera o banco DIRETAMENTE via SQL, sem passar pela aplicação, para provar que a auditoria detecta.
 *
 *   npm run audit:tamper -- --list
 *   npm run audit:tamper -- --lot <id-do-lote> --mode update-amount [--seq 2]
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  if (config.isProduction && process.env.ALLOW_TAMPER !== 'true') {
    throw new Error('Simulador bloqueado em produção. Defina ALLOW_TAMPER=true se tiver certeza.');
  }
  const db = createDataSource(config);
  await db.initialize();
  try {
    if (args.list || !args.lot) {
      const lots = (await db.query(
        `SELECT id, title, state, bid_count FROM lots ORDER BY created_at DESC LIMIT 30`,
      )) as Array<{ id: string; title: string; state: string; bid_count: number }>;
      console.log('Lotes (id | situação | lances | título):');
      for (const lot of lots) console.log(`  ${lot.id} | ${lot.state} | ${lot.bid_count} | ${lot.title.slice(0, 60)}`);
      console.log('\nModos disponíveis:');
      for (const [mode, description] of Object.entries(MODES))
        console.log(`  --mode ${mode.padEnd(16)} ${description}`);
      return;
    }

    const lotId = String(args.lot);
    const mode = String(args.mode ?? 'update-amount') as Mode;
    if (!(mode in MODES)) throw new Error(`Modo inválido: ${mode}`);
    const bids = (await db.query(`SELECT * FROM bids WHERE lot_id = $1 ORDER BY seq`, [lotId])) as Array<
      Record<string, unknown> & { seq: number; amount_cents: string; hash: string; ends_at_after: Date }
    >;
    if (bids.length === 0 && mode !== 'extend-deadline') throw new Error('O lote não tem lances para adulterar.');
    const seq = args.seq ? Number(args.seq) : mode === 'delete-middle' ? Math.ceil(bids.length / 2) : 1;

    switch (mode) {
      case 'update-amount':
        await db.query(`UPDATE bids SET amount_cents = amount_cents + 100000 WHERE lot_id = $1 AND seq = $2`, [
          lotId,
          seq,
        ]);
        break;
      case 'delete-middle':
        await db.query(`DELETE FROM bids WHERE lot_id = $1 AND seq = $2`, [lotId, seq]);
        break;
      case 'delete-last':
        await db.query(`DELETE FROM bids WHERE lot_id = $1 AND seq = $2`, [lotId, bids[bids.length - 1].seq]);
        break;
      case 'insert-fake': {
        const last = bids[bids.length - 1];
        const bidder = (await db.query(`SELECT id FROM users WHERE role = 'BIDDER' LIMIT 1`)) as Array<{ id: string }>;
        await db.query(
          `INSERT INTO bids (id, lot_id, seq, bidder_id, bidder_alias, amount_cents, created_at, ends_at_after, prev_hash, hash, signature, key_id)
           VALUES ($1, $2, $3, $4, 'FA1CE0', $5, now(), $6, $7, encode(sha256(random()::text::bytea), 'hex'), 'assinatura-forjada', 'chave-desconhecida')`,
          [
            randomUUID(),
            lotId,
            last.seq + 1,
            bidder[0].id,
            Number(last.amount_cents) + 500000,
            last.ends_at_after,
            last.hash,
          ],
        );
        break;
      }
      case 'swap-bidder': {
        const other = (await db.query(
          `SELECT id FROM users WHERE role = 'BIDDER' AND id <> (SELECT bidder_id FROM bids WHERE lot_id = $1 AND seq = $2) LIMIT 1`,
          [lotId, seq],
        )) as Array<{ id: string }>;
        await db.query(`UPDATE bids SET bidder_id = $3 WHERE lot_id = $1 AND seq = $2`, [lotId, seq, other[0].id]);
        break;
      }
      case 'extend-deadline':
        await db.query(`UPDATE lots SET ends_at = ends_at + interval '1 hour' WHERE id = $1`, [lotId]);
        break;
    }
    console.log(`Adulteração "${mode}" aplicada direto no banco (${MODES[mode]}).`);
    console.log(`Abra /auditoria/${lotId} ou GET /api/audit/lots/${lotId} para ver a detecção.`);
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
