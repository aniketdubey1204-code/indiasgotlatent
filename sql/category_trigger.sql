-- Auto-category trigger: every insert/update of an iglll1 link gets the
-- correct category from its dataId. Stops old code from reverting to 'bonus'.
-- Run once. Manual dropdown still applies to non-iglll1 (YouTube/custom) links.

create or replace function public.auto_category()
returns trigger as $$
declare
  did text;
begin
  if NEW.video_url like '%iglll1.freeforall.dev/player?id=%' then
    did := substring(NEW.video_url from 'id=([^&]+)');
    NEW.category := case
      when did like '%bts%' then 's2bts'
      when did in ('special-01', 'kapil-01') or did like '%stillalive%' then 'special'
      when did like 's2-%bonus%' or did like '%bonus%' or did like '%clip%'
        or did like 'extra-%' or did like '%discard%' or did like '%delet%' then
        case when did like 's2%' then 's2bonus' else 's1bonus' end
      when did like 's2-%' then 'season2'
      when did like 'ep-%' then 'season1'
      else 's1bonus'
    end;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists videos_auto_category on public.videos;
create trigger videos_auto_category
before insert or update of video_url, category on public.videos
for each row execute function public.auto_category();
