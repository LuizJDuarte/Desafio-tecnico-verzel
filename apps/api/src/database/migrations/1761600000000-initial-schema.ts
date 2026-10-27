import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial. As regras de dinheiro que NUNCA podem ser violadas também estão no banco
 * (CHECK constraints), como última linha de defesa caso um bug passe pela aplicação.
 */
export class InitialSchema1761600000000 implements MigrationInterface {
  name = 'InitialSchema1761600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE user_role AS ENUM ('BIDDER', 'AUCTIONEER')`);
    await queryRunner.query(`CREATE TYPE lot_state AS ENUM ('OPEN', 'CANCELLED', 'SETTLED')`);
    await queryRunner.query(
      `CREATE TYPE wallet_transaction_type AS ENUM ('DEPOSIT', 'HOLD', 'RELEASE', 'CAPTURE', 'SALE_CREDIT')`,
    );

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        email varchar(254) NOT NULL,
        password_hash varchar(100) NOT NULL,
        role user_role NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_email_lowercase CHECK (email = lower(email))
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX users_email_key ON users (email)`);

    await queryRunner.query(`
      CREATE TABLE wallets (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        balance_cents bigint NOT NULL DEFAULT 0,
        held_cents bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT wallets_balance_non_negative CHECK (balance_cents >= 0),
        CONSTRAINT wallets_held_non_negative CHECK (held_cents >= 0),
        CONSTRAINT wallets_held_within_balance CHECK (held_cents <= balance_cents)
      )`);

    await queryRunner.query(`
      CREATE TABLE lot_images (
        id uuid PRIMARY KEY,
        content_type varchar(100) NOT NULL,
        data bytea NOT NULL,
        byte_size integer NOT NULL,
        sha256 char(64) NOT NULL,
        source_url text NOT NULL,
        created_at timestamptz NOT NULL
      )`);

    await queryRunner.query(`
      CREATE TABLE lots (
        id uuid PRIMARY KEY,
        number serial NOT NULL,
        seller_id uuid NOT NULL REFERENCES users (id),
        source varchar(20) NOT NULL,
        external_id varchar(64) NOT NULL,
        title varchar(300) NOT NULL,
        artist varchar(300),
        description text,
        attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
        item_snapshot jsonb NOT NULL,
        image_id uuid REFERENCES lot_images (id),
        image_remote_url text,
        image_lqip text,
        image_alt text,
        starting_price_cents bigint NOT NULL,
        min_increment_cents bigint NOT NULL,
        starts_at timestamptz NOT NULL,
        original_ends_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        anti_sniping_window_ms integer NOT NULL,
        anti_sniping_extension_ms integer NOT NULL,
        state lot_state NOT NULL DEFAULT 'OPEN',
        bid_count integer NOT NULL DEFAULT 0,
        current_price_cents bigint,
        leader_id uuid REFERENCES users (id),
        last_bid_at timestamptz,
        genesis_hash char(64) NOT NULL,
        genesis_signature varchar(128) NOT NULL,
        genesis_key_id varchar(32) NOT NULL,
        head_hash char(64) NOT NULL,
        head_signature varchar(128) NOT NULL,
        head_key_id varchar(32) NOT NULL,
        cancelled_at timestamptz,
        cancel_reason varchar(300),
        settled_at timestamptz,
        winner_id uuid REFERENCES users (id),
        final_price_cents bigint,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CONSTRAINT lots_prices_positive CHECK (starting_price_cents > 0 AND min_increment_cents > 0),
        CONSTRAINT lots_window_valid CHECK (original_ends_at > starts_at AND ends_at >= original_ends_at),
        CONSTRAINT lots_bid_count_non_negative CHECK (bid_count >= 0),
        CONSTRAINT lots_bid_state_consistent CHECK (
          (bid_count = 0 AND current_price_cents IS NULL AND leader_id IS NULL)
          OR (bid_count > 0 AND current_price_cents IS NOT NULL AND leader_id IS NOT NULL)
        ),
        CONSTRAINT lots_settlement_consistent CHECK ((state = 'SETTLED') = (settled_at IS NOT NULL)),
        CONSTRAINT lots_cancellation_consistent CHECK ((state = 'CANCELLED') = (cancelled_at IS NOT NULL))
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX lots_number_key ON lots (number)`);
    await queryRunner.query(`CREATE INDEX lots_showcase_idx ON lots (state, starts_at, ends_at)`);
    await queryRunner.query(`CREATE INDEX lots_seller_idx ON lots (seller_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX lots_open_ends_at_idx ON lots (ends_at) WHERE state = 'OPEN'`);
    await queryRunner.query(`CREATE INDEX lots_leader_open_idx ON lots (leader_id) WHERE state = 'OPEN'`);

    await queryRunner.query(`
      CREATE TABLE bids (
        id uuid PRIMARY KEY,
        lot_id uuid NOT NULL REFERENCES lots (id),
        seq integer NOT NULL,
        bidder_id uuid NOT NULL REFERENCES users (id),
        bidder_alias varchar(16) NOT NULL,
        amount_cents bigint NOT NULL,
        created_at timestamptz NOT NULL,
        ends_at_after timestamptz NOT NULL,
        prev_hash char(64) NOT NULL,
        hash char(64) NOT NULL,
        signature varchar(128) NOT NULL,
        key_id varchar(32) NOT NULL,
        CONSTRAINT bids_amount_positive CHECK (amount_cents > 0),
        CONSTRAINT bids_seq_positive CHECK (seq > 0)
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX bids_lot_seq_key ON bids (lot_id, seq)`);
    await queryRunner.query(`CREATE INDEX bids_bidder_idx ON bids (bidder_id, lot_id)`);
    await queryRunner.query(
      `COMMENT ON TABLE bids IS 'Histórico de lances append-only, encadeado por hash (prev_hash -> hash) e assinado (Ed25519). Alterações diretas são detectadas pela auditoria.'`,
    );

    await queryRunner.query(`CREATE SEQUENCE receipt_number_seq START 1`);
    await queryRunner.query(`
      CREATE TABLE receipts (
        id uuid PRIMARY KEY,
        code varchar(32) NOT NULL,
        number integer NOT NULL,
        lot_id uuid NOT NULL REFERENCES lots (id),
        winner_id uuid NOT NULL REFERENCES users (id),
        winner_alias varchar(16) NOT NULL,
        lot_title varchar(300) NOT NULL,
        amount_cents bigint NOT NULL,
        bid_count integer NOT NULL,
        head_hash char(64) NOT NULL,
        closed_at timestamptz NOT NULL,
        issued_at timestamptz NOT NULL,
        payload_hash char(64) NOT NULL,
        signature varchar(128) NOT NULL,
        key_id varchar(32) NOT NULL
      )`);
    await queryRunner.query(`CREATE UNIQUE INDEX receipts_code_key ON receipts (code)`);
    await queryRunner.query(`CREATE UNIQUE INDEX receipts_number_key ON receipts (number)`);
    await queryRunner.query(`CREATE UNIQUE INDEX receipts_lot_key ON receipts (lot_id)`);

    await queryRunner.query(`
      CREATE TABLE wallet_transactions (
        id uuid PRIMARY KEY,
        seq bigserial NOT NULL,
        user_id uuid NOT NULL REFERENCES users (id),
        type wallet_transaction_type NOT NULL,
        amount_cents bigint NOT NULL,
        balance_after_cents bigint NOT NULL,
        held_after_cents bigint NOT NULL,
        lot_id uuid REFERENCES lots (id),
        description varchar(300) NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT wallet_transactions_amount_positive CHECK (amount_cents > 0)
      )`);
    await queryRunner.query(
      `CREATE INDEX wallet_transactions_user_idx ON wallet_transactions (user_id, created_at DESC, seq DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE api_cache (
        key varchar(300) PRIMARY KEY,
        payload jsonb NOT NULL,
        fetched_at timestamptz NOT NULL
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS api_cache`);
    await queryRunner.query(`DROP TABLE IF EXISTS wallet_transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS receipts`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS receipt_number_seq`);
    await queryRunner.query(`DROP TABLE IF EXISTS bids`);
    await queryRunner.query(`DROP TABLE IF EXISTS lots`);
    await queryRunner.query(`DROP TABLE IF EXISTS lot_images`);
    await queryRunner.query(`DROP TABLE IF EXISTS wallets`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TYPE IF EXISTS wallet_transaction_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS lot_state`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_role`);
  }
}
