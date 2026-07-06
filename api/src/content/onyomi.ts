/**
 * Cantonese → on'yomi (音読み) correspondence system (learning plan Sprint 3).
 *
 * Cantonese preserves Middle-Chinese finals, so on'yomi correspondences are
 * unusually regular for a Cantonese-native learner. This module encodes the
 * rules + worked examples that become (a) the published cheat sheet and (b) a
 * seeded SRS card pack — converting characters the learner already sight-reads
 * into words they can *hear*.
 *
 * The mappings are the systematic-majority patterns, not exceptionless laws;
 * `note` flags the common irregularities.
 */

export interface OnyomiExample {
  hanzi: string;
  cantonese: string; // jyutping with tone, e.g. "luk6"
  kana: string; // on'yomi in kana, e.g. "ろく"
  romaji: string; // e.g. "roku"
}

export interface OnyomiRule {
  id: string;
  cantoneseFinal: string; // the Cantonese/Middle-Chinese final
  japanesePattern: string; // the on'yomi reflex
  note: string;
  examples: OnyomiExample[];
}

export const ONYOMI_RULES: OnyomiRule[] = [
  {
    id: "final-k",
    cantoneseFinal: "-k (入声 entering tone)",
    japanesePattern: "く / き",
    note: "MC -k stops surface as a -ku/-ki mora. Which one tracks the vowel: back vowels → く, front → き.",
    examples: [
      { hanzi: "六", cantonese: "luk6", kana: "ろく", romaji: "roku" },
      { hanzi: "学", cantonese: "hok6", kana: "がく", romaji: "gaku" },
      { hanzi: "力", cantonese: "lik6", kana: "りき", romaji: "riki" },
      { hanzi: "石", cantonese: "sek6", kana: "せき", romaji: "seki" },
    ],
  },
  {
    id: "final-t",
    cantoneseFinal: "-t (入声 entering tone)",
    japanesePattern: "つ / ち",
    note: "MC -t stops surface as -tsu (older) or -chi. -chi is the go-on layer, -tsu the kan-on.",
    examples: [
      { hanzi: "一", cantonese: "jat1", kana: "いち", romaji: "ichi" },
      { hanzi: "日", cantonese: "jat6", kana: "にち", romaji: "nichi" },
      { hanzi: "察", cantonese: "caat3", kana: "さつ", romaji: "satsu" },
      { hanzi: "発", cantonese: "faat3", kana: "はつ", romaji: "hatsu" },
    ],
  },
  {
    id: "final-p",
    cantoneseFinal: "-p (入声 entering tone)",
    japanesePattern: "う (historically ふ)",
    note: "MC -p stops became -fu then merged to a long vowel / -u. Often lengthens the preceding vowel in compounds.",
    examples: [
      { hanzi: "十", cantonese: "sap6", kana: "じゅう", romaji: "jū" },
      { hanzi: "合", cantonese: "hap6", kana: "ごう", romaji: "gō" },
      { hanzi: "入", cantonese: "jap6", kana: "にゅう", romaji: "nyū" },
      { hanzi: "答", cantonese: "daap3", kana: "とう", romaji: "tō" },
    ],
  },
  {
    id: "final-m",
    cantoneseFinal: "-m (nasal)",
    japanesePattern: "ん",
    note: "MC -m merged with -n in Japanese; both surface as the syllabic ん.",
    examples: [
      { hanzi: "三", cantonese: "saam1", kana: "さん", romaji: "san" },
      { hanzi: "心", cantonese: "sam1", kana: "しん", romaji: "shin" },
      { hanzi: "金", cantonese: "gam1", kana: "きん", romaji: "kin" },
      { hanzi: "南", cantonese: "naam4", kana: "なん", romaji: "nan" },
    ],
  },
  {
    id: "final-n",
    cantoneseFinal: "-n (nasal)",
    japanesePattern: "ん",
    note: "MC -n surfaces directly as syllabic ん.",
    examples: [
      { hanzi: "民", cantonese: "man4", kana: "みん", romaji: "min" },
      { hanzi: "天", cantonese: "tin1", kana: "てん", romaji: "ten" },
      { hanzi: "山", cantonese: "saan1", kana: "さん", romaji: "san" },
      { hanzi: "年", cantonese: "nin4", kana: "ねん", romaji: "nen" },
    ],
  },
  {
    id: "final-ng",
    cantoneseFinal: "-ng (velar nasal)",
    japanesePattern: "う / い (long vowel)",
    note: "MC -ng did not survive as a nasal; it lengthened the vowel — back vowels → う, front → い.",
    examples: [
      { hanzi: "東", cantonese: "dung1", kana: "とう", romaji: "tō" },
      { hanzi: "生", cantonese: "sang1", kana: "せい", romaji: "sei" },
      { hanzi: "明", cantonese: "ming4", kana: "めい", romaji: "mei" },
      { hanzi: "京", cantonese: "ging1", kana: "きょう", romaji: "kyō" },
    ],
  },
];

export interface OnyomiCard {
  hanzi: string;
  cantonese: string;
  kana: string;
  romaji: string;
  ruleId: string;
  pattern: string;
}

/** Flatten the rules into individual character cards for the SRS pack. */
export function onyomiCards(): OnyomiCard[] {
  const cards: OnyomiCard[] = [];
  for (const rule of ONYOMI_RULES) {
    for (const ex of rule.examples) {
      cards.push({
        hanzi: ex.hanzi,
        cantonese: ex.cantonese,
        kana: ex.kana,
        romaji: ex.romaji,
        ruleId: rule.id,
        pattern: rule.japanesePattern,
      });
    }
  }
  return cards;
}
