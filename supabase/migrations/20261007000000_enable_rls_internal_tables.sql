-- 보안 점검 rls_disabled_in_public ERROR 14건 해소.
-- 이 표들은 전부 service_role(scripts/*, lib/supabase.ts supabaseAdmin)로만 접근하고 anon 키 사용처가 없다.
-- service_role 은 RLS 를 우회하므로 정책 없이 켜면 anon/authenticated 만 막힌다. 백업 표도 지우지 않고 RLS 만 켠다.
ALTER TABLE public.articles_dupe_backup_20260817 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles_rss_ghost_backup_20260822 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles_unpublish_backup_20260817 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords_legacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_kb_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_kb_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_kb_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_kb_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_kb_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_serp_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mih_serp_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serp_repoint_backup_20260817 ENABLE ROW LEVEL SECURITY;
