begin;

select plan(17);

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sync_items'::regclass), 'sync_items has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.reading_progress'::regclass), 'reading_progress has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.user_lists'::regclass), 'user_lists has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.list_memberships'::regclass), 'list_memberships has RLS enabled');

select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles' and roles = '{authenticated}'::name[]), 4::bigint, 'profiles has four authenticated owner policies');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'sync_items' and roles = '{authenticated}'::name[]), 4::bigint, 'sync_items has four authenticated owner policies');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'reading_progress' and roles = '{authenticated}'::name[]), 4::bigint, 'reading_progress has four authenticated owner policies');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_lists' and roles = '{authenticated}'::name[]), 4::bigint, 'user_lists has four authenticated owner policies');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'list_memberships' and roles = '{authenticated}'::name[]), 4::bigint, 'list_memberships has four authenticated owner policies');

select ok(has_table_privilege('authenticated', 'public.profiles', 'select,insert,update,delete'), 'authenticated has profile grants');
select ok(has_table_privilege('authenticated', 'public.sync_items', 'select,insert,update,delete'), 'authenticated has sync item grants');
select ok(has_table_privilege('authenticated', 'public.reading_progress', 'select,insert,update,delete'), 'authenticated has progress grants');
select ok(has_table_privilege('authenticated', 'public.user_lists', 'select,insert,update,delete'), 'authenticated has list grants');
select ok(has_table_privilege('authenticated', 'public.list_memberships', 'select,insert,update,delete'), 'authenticated has membership grants');

select ok(has_function_privilege('authenticated', 'public.merge_reading_progress(text,text,text,double precision,integer,integer,text,boolean,smallint,boolean)', 'execute'), 'authenticated can call the progress merge RPC');
select ok(not has_function_privilege('anon', 'public.merge_reading_progress(text,text,text,double precision,integer,integer,text,boolean,smallint,boolean)', 'execute'), 'anon cannot call the progress merge RPC');

select * from finish();
rollback;
