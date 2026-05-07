-- Migration: stats_clients_cards_indexes
-- Date: 2026-05-06
-- Author: backend-engineer
-- Description:
--   1. Creates partial indexes IDX-2 and IDX-3 on `payments` to support
--      the Edge Function `stats-clients-cards` (Q1, Q2, Q3).
--   2. Creates SQL function fn_stats_clients_cards(p_ref date, p_te uuid)
--      that the Edge Function calls via .rpc() in a single round-trip.
--
-- Indexes NOT created here (already confirmed or deferred):
--   - idx_payments_reception_date (IDX-1): confirmed existing, no action needed.
--   - idx_cta_trainer_active (IDX-5): confirmed existing, no action needed.
--   - payments_plan_price_id_fkey (IDX-6): FK auto-index, no action needed.
--   - idx_payments_period_end (IDX-4): deferred — create only if advisors flag it.
--
-- IMPORTANT: partial index predicate is status != 'voided' AND voided_at IS NULL.
-- The fn_stats_clients_cards function uses EXACTLY this predicate so the planner
-- can use these partial indexes (Postgres requires query predicate to imply index WHERE clause).

-- ─── IDX-2: range scan on reception_date, non-voided payments ────────────────
CREATE INDEX IF NOT EXISTS idx_payments_reception_paid
  ON public.payments (reception_date, client_id)
  WHERE status != 'voided' AND voided_at IS NULL;

-- ─── IDX-3: latest-payment-per-client lookup, non-voided payments ─────────────
CREATE INDEX IF NOT EXISTS idx_payments_client_reception_desc
  ON public.payments (client_id, reception_date DESC)
  WHERE status != 'voided' AND voided_at IS NULL;

-- ─── fn_stats_clients_cards ───────────────────────────────────────────────────
--
-- Returns a single row with aggregated counts for TIPO A and TIPO B,
-- current period and previous period, broken down by plan_frequency (6d / 3d).
--
-- Parameters:
--   p_ref  date  — fecha_referencia (the "today" snapshot date)
--   p_te   uuid  — effective trainer id; NULL means all trainers
--
-- The Edge Function computes delta in TypeScript (ta_total - ta_prev_total, etc.)
-- rather than SQL to keep the SQL pure aggregation.
--
-- Partial index usage guarantee: every filter on payments uses
--   status != 'voided' AND voided_at IS NULL
-- which exactly matches IDX-2 and IDX-3 WHERE clauses.

CREATE OR REPLACE FUNCTION public.fn_stats_clients_cards(
  p_ref date,
  p_te  uuid DEFAULT NULL
)
RETURNS TABLE (
  ta_total      bigint,
  ta_6d         bigint,
  ta_3d         bigint,
  ta_prev_total bigint,
  tb_total      bigint,
  tb_6d         bigint,
  tb_3d         bigint,
  tb_prev_total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH params AS (
  SELECT
    p_ref                                                              AS ref,
    date_trunc('month', p_ref)::date                                  AS start_of_month,
    LEAST(
      (p_ref - INTERVAL '1 month')::date,
      (date_trunc('month', p_ref) - INTERVAL '1 day')::date
    )::date                                                            AS prev_ref,
    (date_trunc('month', p_ref) - INTERVAL '1 month')::date          AS start_of_prev_month
),

-- All non-voided payments joined with plan_prices for plan_frequency.
-- WHERE clause mirrors the partial index predicate exactly (IDX-2, IDX-3).
valid_payments AS (
  SELECT
    p.client_id,
    p.reception_date,
    p.period_end,
    pp.plan_frequency
  FROM payments p
  JOIN plan_prices pp ON pp.id = p.plan_price_id
  WHERE p.status != 'voided'
    AND p.voided_at IS NULL
),

-- Most recent non-voided payment per client as of p_ref (uses IDX-3).
latest_at_ref AS (
  SELECT DISTINCT ON (vp.client_id)
    vp.client_id,
    vp.reception_date,
    vp.period_end,
    vp.plan_frequency
  FROM valid_payments vp, params
  WHERE vp.reception_date <= params.ref
  ORDER BY vp.client_id, vp.reception_date DESC
),

-- Most recent non-voided payment per client as of prev_ref (uses IDX-3).
latest_at_prev AS (
  SELECT DISTINCT ON (vp.client_id)
    vp.client_id,
    vp.reception_date,
    vp.period_end,
    vp.plan_frequency
  FROM valid_payments vp, params
  WHERE vp.reception_date <= params.prev_ref
  ORDER BY vp.client_id, vp.reception_date DESC
),

-- ── TIPO A current ──────────────────────────────────────────────────────────
-- Clients with at least one valid payment in [start_of_month, ref].
-- Plan breakdown uses the latest payment within that same period (uses IDX-2).
tipo_a_cur AS (
  SELECT DISTINCT ON (vp.client_id)
    vp.client_id,
    vp.plan_frequency
  FROM valid_payments vp, params
  WHERE vp.reception_date >= params.start_of_month
    AND vp.reception_date <= params.ref
    AND (
      p_te IS NULL
      OR EXISTS (
        SELECT 1 FROM client_trainer_assignments cta
        WHERE cta.client_id = vp.client_id
          AND cta.trainer_id = p_te
          AND cta.ended_at IS NULL
      )
    )
  ORDER BY vp.client_id, vp.reception_date DESC
),

-- ── TIPO A previous ─────────────────────────────────────────────────────────
-- Same logic anchored at [start_of_prev_month, prev_ref].
tipo_a_prev AS (
  SELECT DISTINCT ON (vp.client_id)
    vp.client_id,
    vp.plan_frequency
  FROM valid_payments vp, params
  WHERE vp.reception_date >= params.start_of_prev_month
    AND vp.reception_date <= params.prev_ref
    AND (
      p_te IS NULL
      OR EXISTS (
        SELECT 1 FROM client_trainer_assignments cta
        WHERE cta.client_id = vp.client_id
          AND cta.trainer_id = p_te
          AND cta.ended_at IS NULL
      )
    )
  ORDER BY vp.client_id, vp.reception_date DESC
),

-- ── TIPO B current ──────────────────────────────────────────────────────────
-- Clients whose most recent valid payment as of ref:
--   a) is still covering the client (period_end >= ref)
--   b) was made BEFORE the current month (reception_date < start_of_month)
-- Condition (b) guarantees the client has not paid yet this month.
tipo_b_cur AS (
  SELECT
    lr.client_id,
    lr.plan_frequency
  FROM latest_at_ref lr, params
  WHERE lr.period_end >= params.ref
    AND lr.reception_date < params.start_of_month
    AND (
      p_te IS NULL
      OR EXISTS (
        SELECT 1 FROM client_trainer_assignments cta
        WHERE cta.client_id = lr.client_id
          AND cta.trainer_id = p_te
          AND cta.ended_at IS NULL
      )
    )
),

-- ── TIPO B previous ─────────────────────────────────────────────────────────
-- Same logic anchored at prev_ref / start_of_prev_month.
-- Historical snapshot: what was TIPO B on that date, not today.
tipo_b_prev AS (
  SELECT
    lp.client_id,
    lp.plan_frequency
  FROM latest_at_prev lp, params
  WHERE lp.period_end >= params.prev_ref
    AND lp.reception_date < params.start_of_prev_month
    AND (
      p_te IS NULL
      OR EXISTS (
        SELECT 1 FROM client_trainer_assignments cta
        WHERE cta.client_id = lp.client_id
          AND cta.trainer_id = p_te
          AND cta.ended_at IS NULL
      )
    )
)

SELECT
  -- TIPO A current
  (SELECT COUNT(*)                                              FROM tipo_a_cur)              AS ta_total,
  (SELECT COUNT(*) FILTER (WHERE plan_frequency = '6d')        FROM tipo_a_cur)              AS ta_6d,
  (SELECT COUNT(*) FILTER (WHERE plan_frequency = '3d')        FROM tipo_a_cur)              AS ta_3d,
  -- TIPO A previous (for delta computation in EF)
  (SELECT COUNT(*)                                              FROM tipo_a_prev)             AS ta_prev_total,
  -- TIPO B current
  (SELECT COUNT(*)                                              FROM tipo_b_cur)              AS tb_total,
  (SELECT COUNT(*) FILTER (WHERE plan_frequency = '6d')        FROM tipo_b_cur)              AS tb_6d,
  (SELECT COUNT(*) FILTER (WHERE plan_frequency = '3d')        FROM tipo_b_cur)              AS tb_3d,
  -- TIPO B previous (for delta computation in EF)
  (SELECT COUNT(*)                                              FROM tipo_b_prev)             AS tb_prev_total;
$$;

-- Grant execute to service_role only (EF uses service_role key).
-- Revoke from PUBLIC and anon to block unauthenticated callers
-- (memory note: must revoke from anon explicitly, REVOKE FROM PUBLIC is not enough).
REVOKE EXECUTE ON FUNCTION public.fn_stats_clients_cards(date, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_stats_clients_cards(date, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_stats_clients_cards(date, uuid) TO service_role;
