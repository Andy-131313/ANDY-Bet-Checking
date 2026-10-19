-- Spustit jednou v Neon SQL Editoru; nemaže existující tabulky.
CREATE TABLE IF NOT EXISTS livesport_fixtures (
 source_id text PRIMARY KEY,
 league text NOT NULL,
 season text NOT NULL,
 date text NOT NULL,
 home text NOT NULL,
 away text NOT NULL,
 status text NOT NULL,
 hg integer,
 ag integer,
 source_url text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (status IN ('scheduled','finished'))
);
CREATE INDEX IF NOT EXISTS livesport_fixtures_league_date ON livesport_fixtures(league,date);
CREATE TABLE IF NOT EXISTS livesport_sync_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 status text NOT NULL DEFAULT 'running',
 imported integer NOT NULL DEFAULT 0,
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
