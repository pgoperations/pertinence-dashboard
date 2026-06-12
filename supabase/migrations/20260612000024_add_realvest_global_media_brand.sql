-- Add "RealVest Global" as a distinct media brand. It appears as its own
-- column (alongside RealVest) on the 2025 Media Team Reporting tab, so it is a
-- separate brand — NOT an alias of RealVest (confirmed by the supervisor,
-- 2026-06-12). Until now its cells ingested unattributed and raised
-- unknown_media_brand. Same idempotent seed pattern as migration 021.
insert into public.media_brands (key, display_name, display_order) values
  ('realvest_global', 'RealVest Global', 9)
on conflict (key) do nothing;

insert into public.media_brand_aliases (brand_key, alias)
select v.brand_key, v.alias
from (values
  ('realvest_global', 'REALVEST GLOBAL'),
  ('realvest_global', 'RealVest Global'),
  ('realvest_global', 'REALVEST GLOBAL ')   -- defensive: trailing space seen on the grid
) as v(brand_key, alias)
on conflict (lower(alias)) do nothing;
