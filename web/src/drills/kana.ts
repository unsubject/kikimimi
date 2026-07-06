/** Gojūon + common digraphs for the Sprint-1 kana automaticity drills. */
export interface Kana {
  hira: string;
  kata: string;
  romaji: string;
}

export const KANA: Kana[] = [
  { hira: "あ", kata: "ア", romaji: "a" },
  { hira: "い", kata: "イ", romaji: "i" },
  { hira: "う", kata: "ウ", romaji: "u" },
  { hira: "え", kata: "エ", romaji: "e" },
  { hira: "お", kata: "オ", romaji: "o" },
  { hira: "か", kata: "カ", romaji: "ka" },
  { hira: "き", kata: "キ", romaji: "ki" },
  { hira: "く", kata: "ク", romaji: "ku" },
  { hira: "け", kata: "ケ", romaji: "ke" },
  { hira: "こ", kata: "コ", romaji: "ko" },
  { hira: "さ", kata: "サ", romaji: "sa" },
  { hira: "し", kata: "シ", romaji: "shi" },
  { hira: "す", kata: "ス", romaji: "su" },
  { hira: "せ", kata: "セ", romaji: "se" },
  { hira: "そ", kata: "ソ", romaji: "so" },
  { hira: "た", kata: "タ", romaji: "ta" },
  { hira: "ち", kata: "チ", romaji: "chi" },
  { hira: "つ", kata: "ツ", romaji: "tsu" },
  { hira: "て", kata: "テ", romaji: "te" },
  { hira: "と", kata: "ト", romaji: "to" },
  { hira: "な", kata: "ナ", romaji: "na" },
  { hira: "に", kata: "ニ", romaji: "ni" },
  { hira: "ぬ", kata: "ヌ", romaji: "nu" },
  { hira: "ね", kata: "ネ", romaji: "ne" },
  { hira: "の", kata: "ノ", romaji: "no" },
  { hira: "は", kata: "ハ", romaji: "ha" },
  { hira: "ひ", kata: "ヒ", romaji: "hi" },
  { hira: "ふ", kata: "フ", romaji: "fu" },
  { hira: "へ", kata: "ヘ", romaji: "he" },
  { hira: "ほ", kata: "ホ", romaji: "ho" },
  { hira: "ま", kata: "マ", romaji: "ma" },
  { hira: "み", kata: "ミ", romaji: "mi" },
  { hira: "む", kata: "ム", romaji: "mu" },
  { hira: "め", kata: "メ", romaji: "me" },
  { hira: "も", kata: "モ", romaji: "mo" },
  { hira: "や", kata: "ヤ", romaji: "ya" },
  { hira: "ゆ", kata: "ユ", romaji: "yu" },
  { hira: "よ", kata: "ヨ", romaji: "yo" },
  { hira: "ら", kata: "ラ", romaji: "ra" },
  { hira: "り", kata: "リ", romaji: "ri" },
  { hira: "る", kata: "ル", romaji: "ru" },
  { hira: "れ", kata: "レ", romaji: "re" },
  { hira: "ろ", kata: "ロ", romaji: "ro" },
  { hira: "わ", kata: "ワ", romaji: "wa" },
  { hira: "を", kata: "ヲ", romaji: "wo" },
  { hira: "ん", kata: "ン", romaji: "n" },
];

export type KanaSet = "hiragana" | "katakana";

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Build 3 distractors + the answer for a multiple-choice question. */
export function choicesFor(target: Kana): string[] {
  const distractors = shuffle(KANA.filter((k) => k.romaji !== target.romaji))
    .slice(0, 3)
    .map((k) => k.romaji);
  return shuffle([target.romaji, ...distractors]);
}
