-- The review queue (/review, badge count) runs
--   select ... from srs_cards where due_at is not null and due_at <= now() order by due_at
-- on every load. Add the partial index it wants so it's an index range scan,
-- not a full table scan, as the deck grows.
create index if not exists srs_cards_due_at_idx
  on srs_cards (due_at)
  where due_at is not null;
