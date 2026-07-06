# Japanese Learning Plan — The Bookstore & The Bridge

**Prepared for 利世民 (Simon Lee) | July 6, 2026 | Milestone-based — advance by deliverables, never by dates**

---

## The North Star

> When you overhear or join a short Japanese conversation, you can follow what it is about **without subtitles** and respond plainly. When you pull a book off a Kinokuniya (紀伊國屋) shelf, you can follow its argument or story unaided. The goal is not eloquence or native polish — it is comprehension deep enough to **enter the Japanese mindset through its own voices and texts**, and eventually to bridge that world outward to your audience.

Listening leads. Reading follows. Speaking is plain and functional. Culture rides along on real content, not textbook dialogues.

---

## ⚠️ Before Sprint 1: Assumptions to Confirm

- **Time floor: 3 hrs/week** (daily ~10-min micro-dose + 1–2 burst sessions). Sprints are sized so the floor alone completes them; bursts only accelerate. *Stated, never explicitly confirmed.*
- **Daily audio drop time: 7:00 AM ET** (suggested — before the day's production work). Needs your actual hands-busy/ears-free slot.
- **Cost ceiling: $2.00/day hard stop, $45/month circuit breaker** (p95-based; see app spec). Needs your yes.
- **TTS provider: OpenAI tts-1** as default voice (cheapest adequate option); ElevenLabs upgrade path if voice quality bothers you.
- **Cantonese→on'yomi acceleration** is baked into Sprint 3 as a core method, on the assumption your Cantonese phonology is native-strong.

---

## Design Principles (non-negotiable)

| Principle | Rule |
|-----------|------|
| Milestone-based | Advance by completing deliverables, not by calendar |
| Listening-first | Sound before script; every text has audio; no silent reading in Sprints 1–3 |
| Teach-to-learn | Every unit ends with an explain-back — comprehension proven by explaining it to someone |
| Scaffold fade | JP audio + JP text + tap-reveal ZH → JP audio + JP text → pure audio. Graduation is earned, per skill, per content type |
| Anti-bypass | Chinese translation is never visible by default — tap-to-reveal only. Your kanji sight-reading must not become a listening bypass |
| Unit cap | 25–30 min max per concept unit; longer = burst/build session |
| Streak-free | No daily-streak mechanics anywhere. A missed week costs only the week |
| Exploration Licences | 2–3 per sprint: sanctioned rabbit-holes, mapped back afterward |
| Work Gallery | Every deliverable logged in Notion — visible accumulation is the dopamine mechanic |
| Adaptive checkpoints | Every 14 days, 20-min diagnostic; adjust pace, depth, examples |

---

## The Two Tracks

This plan runs **Learner track** and **Builder track** in parallel. The app (working name: **聞き耳 Kikimimi** — "the listening ear") is both your delivery system and your Sprint deliverable stream. You are dogfooding your own product from day one; every study session doubles as QA. See the companion app spec for the build side.

**Your asymmetric advantages, used deliberately:**
1. **Kanji sight-reading** — you skip the single biggest grind for Western learners. The plan spends that saved time on sound.
2. **Cantonese phonology** — Cantonese preserves Middle Chinese finals, so on'yomi (音読み) correspondences are unusually regular for you (六 luk6 → ろく roku; 三 saam1 → さん san; 学 hok6 → がく gaku). Sprint 3 systematizes this into a personal accelerator.
3. **College-level Japan cultural/historical literacy** — content can be interesting from week one. No 「これはペンです」 purgatory.

**Your one structural risk, guarded explicitly:** kanji lets you *fake* reading while phonology stays at zero — and listening is built entirely on phonology. Hence: listening-first, audio-always, translation hidden by default.

---

## The Six Sprints

*Each sprint ≈ 30 days at the 3 hr/week floor; bursts compress. This is Phase 1 of a multi-year arc — it ends at roughly A2–B1 listening/reading foundation. Literature (Phase 2–3) is regenerated at the final checkpoint.*

---

### Sprint 1 — Sound Before Script（音が先）
**Days 1–30 | Hardcode the kana and install Japanese phonology, so that everything you learn afterward has a sound.**

**Topics:**
1. Hiragana automaticity — recognition and recall under 1 second; this is the operating system
2. Katakana automaticity — loanword decoding; economics vocabulary is katakana-heavy (インフレ, コスト, リスク)
3. Mora and rhythm — Japanese timing is mora-based, not stress-based; this is the foundation of listening
4. The contrasts Chinese speakers miss — long vowels (おばさん aunt vs おばあさん grandmother), double consonants (きて vs きって), syllabic ん
5. Pitch accent awareness — not mastery, just knowing it exists; it trains the ear
6. The sound-symbol loop — reading kana aloud, shadowing single sentences

**Resources:**
- Primary: App v0.1 daily sentence drops + kana drills (Builder track output)
- Secondary: Tofugu kana guides (mnemonic-based); Comprehensible Japanese (YouTube, complete-beginner playlist)
- Claude: Conversational phonology explainer; generates kana drill sets for the bot; evaluates your recorded kana reading via Telegram voice notes

**Sprint Deliverable:**
(a) Voice note reading a 5-sentence NHK Easy-derived text aloud, evaluated at ≥90% kana accuracy. (b) **Ship app v0.1** — daily audio drop + tap-to-reveal working in Telegram.

**ADHD Hook:** You are not "studying kana" — you are calibrating an instrument you built. Every drill is dogfooding your own product, and v0.1 shipping is a deliverable you can already show.

---

### Sprint 2 — The Grammar Skeleton（文法の骨格）
**Days 31–60 | Install the minimal grammatical model of Japanese — enough to parse real sentences, taught the way you learn: to explain it.**

**Topics:**
1. Particles は・が・を・に・で・と・も — the case-marking logic (closer to how you think about syntax than to school grammar)
2. The copula だ／です and the politeness axis
3. Verb groups and the four forms that unlock 80% of speech: ます・て・た・ない
4. い-adjectives vs な-adjectives
5. Word order and omission — Japanese drops everything contextual, like Cantonese but more so; this is familiar terrain
6. Questions and negation

**Resources:**
- Primary: Cure Dolly "Japanese from Scratch" series (structural, model-based — built for people who want to explain the system, not memorize rules)
- Secondary: Tae Kim's Guide to Japanese Grammar (free, reference use)
- Claude: Socratic grammar explainer; generates example sentences drawn from that day's actual news item; checks your explain-backs against the model
- App: Stage-1 daily podcast begins — 1-minute graded item, JP audio + furigana text + tap-reveal ZH gist

**Sprint Deliverable:**
A written explainer, ~1,000 words: **"Japanese grammar for Chinese speakers — what transfers, what betrays you."** Teach-to-learn artifact; goes in the Work Gallery and is proto-content for a future 利世民頻道 segment.

**ADHD Hook:** The learning process itself becomes minable content. You are two sprints in and already producing something publishable.

---

### Sprint 3 — The Listening Engine（聴解エンジン）
**Days 61–90 | The core methodology sprint — closest to the North Star. Build real-time comprehension and activate your Cantonese superpower.**

**Topics:**
1. Scaffold graduation S1 → S2 — the app removes the Chinese layer when your trailing explain-back accuracy earns it
2. Shadowing method — repeat-after with your own voice notes, compared against source audio
3. Speed laddering — slow variant (≈0.85×) → natural speed
4. **Cantonese → on'yomi correspondence system** — the regular sound mappings (k-finals → く/き, m/n-finals → ん, p-finals → つ/う…) turned into a personal cheat sheet; this converts thousands of characters you sight-read into words you can *hear*
5. The 300 highest-frequency spoken words — from your actual daily items, not a generic list
6. Listening for gist vs listening for detail — two different skills, trained separately

**Resources:**
- Primary: App daily podcast, now 2–3 min (v0.3: shadowing mode + graduation logic)
- Secondary: Nihongo con Teppei (Beginners) podcast; Comprehensible Japanese intermediate playlist
- Claude: Builds the personalized Cantonese→on'yomi correspondence tables; evaluates shadowing voice notes; grades daily explain-backs and controls graduation

**Sprint Deliverable:**
(a) Pass the graduation test: 5 previously-unheard 1-minute Stage-2 items, explained at ≥80% accuracy **without looking at text**. (b) Publish the Cantonese–on'yomi cheat sheet to the Work Gallery.

**ADHD Hook:** A live, measurable graduation event — your own app switches off the Chinese translation layer because you earned it. That moment is the plan's first boss fight.

---

### Sprint 4 — Speaking Plainly（話す）
**Days 91–120 | Produce Japanese — simple, functional, unembarrassed. Voice notes become conversations.**

**Topics:**
1. Self-introduction and talking about your work (a Hong Kong commentator in Virginia is a genuinely interesting 自己紹介)
2. Stating opinions simply — 〜と思います、〜かもしれません
3. Repair strategies — もう一度お願いします、〜はどういう意味ですか (the skill that keeps real conversations alive)
4. Numbers, dates, prices, percentages — non-negotiable for economics content
5. Keigo awareness — recognize 敬語, don't produce it yet
6. The conversation loop — the bot voice-notes you a question about the day's item; you answer in Japanese voice notes

**Resources:**
- Primary: App conversation mode (v0.4) — Whisper transcription + Claude feedback on every voice note
- Secondary: Optional Pimsleur-style spaced audio during walks
- Claude: Conversation partner and pronunciation/grammar feedback engine; maintains a personal error log and recycles your mistakes into future prompts

**Sprint Deliverable:**
A 2-minute Japanese voice note explaining one Japan economics news item in plain Japanese, passing a comprehensibility rubric (would a patient native speaker follow this without English?).

**ADHD Hook:** The first artifact in which 利世民 speaks Japanese. Keep it — it is the "day one" clip for the inevitable "how I learned Japanese with an app I built" episode.

---

### Sprint 5 — Reading for Real（読解）
**Days 121–150 | Convert sight-reading into true reading: characters + sound + grammar = the actual language. First un-graded texts.**

**Topics:**
1. NHK regular news (non-Easy) — the jump from graded to real
2. Kanji readings expansion to ~600–800 words, frequency-ordered from your own content stream
3. Compound activation — your sight-read compounds (経済, 政策, 社会) become fully-sounded vocabulary
4. Intensive vs extensive reading — dictionary-heavy close reading vs volume reading at 95% comprehension
5. Dictionary workflow — Yomitan (browser pop-up dictionary) setup
6. Graded readers as a bridge — Satori Reader (its scaffold-fade design mirrors the app's)

**Resources:**
- Primary: Satori Reader; NHK News (regular) via app long-read mode (v0.5, Telegram Mini App with furigana toggle)
- Secondary: Yomitan + JMdict; Tadoku free graded readers
- Claude: Reading companion — pre-reads each article and prepares comprehension probes; post-read explain-back grading; tracks which kanji readings are activated vs still sight-only

**Sprint Deliverable:**
Intensive read of one full NHK article + one short essay, producing a **bilingual annotated commentary** — Japanese source, your English/Chinese analysis, names kept in original per your convention. This is Bridge Artifact #1.

**ADHD Hook:** First bookstore simulation — real text written for Japanese adults, falling to you. And the deliverable is already the bridge work you ultimately want to do.

---

### Sprint 6 — The Bookstore Test & The Bridge（検証）
**Days 151–180 | Validation and sovereignty: can you stand behind this capability in public?**

**Topics:**
1. The listening gauntlet — a 3-minute native-speed conversation (podcast clip or interview), no text, no subtitles
2. The bookstore simulation — an unseen general-audience book sample (new release 新書 opening chapter); read and explain
3. The bridge piece — a 利世民頻道 segment or Substack note built **only from Japanese-language sources**
4. Error audit — where do you still break down, and is it vocabulary, speed, or grammar
5. Phase 2 design — the literature track (from 新書 to fiction; Murakami (村上春樹) before Mishima (三島由紀夫))

**Resources:**
- Primary: App dashboard/Work Gallery view (v1.0) — the whole 180 days visible
- Claude: Gauntlet administrator; blind evaluator of the bookstore test; editorial red-team on the bridge piece; co-designer of Phase 2

**Sprint Deliverable:**
(a) Pass the gauntlet: ≥70% gist comprehension on native-speed audio. (b) **Publish the bridge piece.** (c) Phase 2 plan drafted at the closing checkpoint.

**ADHD Hook:** Public stakes. The bridge piece goes to your actual audience — the loop from "learning Japanese" to "being 利世民" closes, and Phase 2 starts from a win.

---

## Adaptive Checkpoint Protocol

Every 14 days, 20 minutes maximum:
1. Which sprint are you on? How does the pace feel?
2. What clicked easily? What is still murky?
3. Adjust: depth (go deeper on murky), pace (compress/expand), examples (swap domain anchors — more econ, less society, or vice versa)
4. Review the app's learner-model data — trailing accuracy, scaffold stage per skill — and override it if it feels wrong
5. Log the checkpoint in 2nd-brain

The app can prompt checkpoints automatically, but the diagnostic conversation happens here, with me.

---

## Resource Master List

| Sprint | Primary | Secondary | Claude role |
|--------|---------|-----------|-------------|
| 1 | App v0.1 drills + drops | Tofugu kana; Comprehensible Japanese | Phonology explainer; voice-note evaluator |
| 2 | Cure Dolly series | Tae Kim's Guide | Socratic grammar coach; explain-back checker |
| 3 | App podcast v0.3 | Nihongo con Teppei; Comprehensible Japanese | On'yomi table builder; graduation controller |
| 4 | App conversation mode v0.4 | Pimsleur-style audio (optional) | Conversation partner; error-log keeper |
| 5 | Satori Reader; app Mini App v0.5 | Yomitan; NHK News; Tadoku | Reading companion; activation tracker |
| 6 | App dashboard v1.0 | Native podcasts; 新書 samples | Gauntlet admin; editorial red-team |

## The Work Gallery

| Sprint | Deliverable | Notion |
|--------|------------|--------|
| 1 | Kana-accurate voice note + app v0.1 shipped | *(link)* |
| 2 | "Japanese grammar for Chinese speakers" explainer | *(link)* |
| 3 | Stage-2 graduation + Cantonese–on'yomi cheat sheet | *(link)* |
| 4 | 2-min Japanese voice explanation of an econ story | *(link)* |
| 5 | Bilingual annotated commentary (Bridge Artifact #1) | *(link)* |
| 6 | Listening gauntlet passed + published bridge piece | *(link)* |

---

*Bias flag, per protocol: this plan leans on comprehensible-input / acquisition-first methodology (Krashen-adjacent) rather than classroom grammar-translation. Given your goals — comprehension and mindset-entry over exam scores — that lean fits, but it is a lean, and it means no JLPT structure unless you want one added.*
