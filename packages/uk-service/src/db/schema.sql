CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id         BIGINT PRIMARY KEY,
    username   TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_active  BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS proxies (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host         TEXT NOT NULL,
    port         INT NOT NULL,
    username     TEXT,
    password_enc TEXT,
    is_active    BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS site_accounts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    BIGINT REFERENCES users(id),
    label      TEXT NOT NULL DEFAULT 'default',
    status     TEXT NOT NULL DEFAULT 'pending',
    proxy_id   UUID REFERENCES proxies(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, label)
);

CREATE TABLE IF NOT EXISTS sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID REFERENCES site_accounts(id) UNIQUE,
    profile_path  TEXT,
    last_used_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'active',
    worker_id     TEXT
);

CREATE TABLE IF NOT EXISTS login_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID REFERENCES site_accounts(id),
    status        TEXT NOT NULL DEFAULT 'pending',
    worker_id     TEXT,
    login_enc     TEXT,
    password_enc  TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    error_message TEXT,
    notified_at   TIMESTAMPTZ
);

-- Добавить колонку если БД уже существует
ALTER TABLE login_requests ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS profile_data JSONB;
ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID REFERENCES site_accounts(id),
    job_type      TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    priority      INT DEFAULT 5,
    status        TEXT NOT NULL DEFAULT 'pending',
    locked_by     TEXT,
    locked_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_runs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id           UUID REFERENCES jobs(id),
    worker_id        TEXT NOT NULL,
    started_at       TIMESTAMPTZ DEFAULT NOW(),
    finished_at      TIMESTAMPTZ,
    status           TEXT,
    currency_earned  NUMERIC,
    screenshot_path  TEXT,
    error_message    TEXT,
    logs             TEXT
);

CREATE TABLE IF NOT EXISTS workers (
    id              TEXT PRIMARY KEY,
    last_heartbeat  TIMESTAMPTZ,
    status          TEXT DEFAULT 'online'
);
