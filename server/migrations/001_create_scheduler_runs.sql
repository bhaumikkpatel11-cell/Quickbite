-- Migration 001: Create scheduler_runs table
-- Purpose: Durable tick receipt recording for Cloudflare Worker scheduler spikes.
-- Unique constraint on (job_name, scheduled_for) guarantees logical deduplication.

CREATE TABLE IF NOT EXISTS scheduler_runs (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(64) NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(32) NOT NULL DEFAULT 'recorded', -- 'recorded', NOT 'completed' (business jobs not yet run)
    trigger_source VARCHAR(32) NOT NULL DEFAULT 'cron',
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_scheduler_runs_job_scheduled UNIQUE (job_name, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_scheduled_for ON scheduler_runs (scheduled_for DESC);
