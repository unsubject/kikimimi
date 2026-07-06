-- Seed the Work Gallery with the six sprint deliverables (learning plan §Work
-- Gallery / spec §7). artifact_url/notion_url are filled in as each is shipped.
-- Guarded so re-running can't duplicate (the table has no unique constraint).
insert into deliverables (sprint, name)
select v.sprint, v.name
from (values
  (1, 'Kana-accurate voice note + app v0.1 shipped'),
  (2, '"Japanese grammar for Chinese speakers" explainer'),
  (3, 'Stage-2 graduation + Cantonese–on''yomi cheat sheet'),
  (4, '2-min Japanese voice explanation of an econ story'),
  (5, 'Bilingual annotated commentary (Bridge Artifact #1)'),
  (6, 'Listening gauntlet passed + published bridge piece')
) as v(sprint, name)
where not exists (select 1 from deliverables);
