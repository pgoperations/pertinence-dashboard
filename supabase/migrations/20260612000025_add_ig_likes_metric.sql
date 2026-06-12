-- Add Instagram "Number of Likes" as a canonical media metric. It appears under
-- the Instagram section on the 2025 Media Team Reporting tab (Facebook uses
-- "Number of Interactions" instead), but wasn't in the v1 metric set, so those
-- rows raised unknown label and were skipped. Additive across weeks → 'sum'.
-- display_order 9 appends it after the existing 8 Instagram metrics (no
-- renumbering). Same idempotent seed pattern as migration 021.
insert into public.media_metric_canonicals (key, display_name, platform, display_order, agg_type) values
  ('ig_likes', 'Number of Likes', 'instagram', 9, 'sum')
on conflict (key) do nothing;

-- Likes is Instagram-only here, so the spelling maps unambiguously (no FB
-- conflict on the lower(alias) unique index). The lookup is case-insensitive,
-- so the lowercase 'Number of likes' seen on the grid resolves too.
insert into public.media_metric_aliases (metric_key, alias)
select v.metric_key, v.alias
from (values
  ('ig_likes', 'Number of Likes'),
  ('ig_likes', 'Number of likes')
) as v(metric_key, alias)
on conflict (lower(alias)) do nothing;
