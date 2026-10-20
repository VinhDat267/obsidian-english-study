import { DictDefinition } from "../../types";
import { BaseProvider } from "./BaseProvider";

export interface FreeDictResult {
  word: string;
  phonetic?: string;
  audioUrl?: string;
  definitions: DictDefinition[];
  isStemFallback?: boolean;
  originalQuery?: string;
}

/**
 * Sinh danh sách các từ gốc khả dĩ (lemmas / stem candidates) khi từ ban đầu gặp 404.
 */
export function getStemCandidates(word: string): string[] {
  const candidates: string[] = [];
  const w = word.toLowerCase().trim();

  // 1. Hậu tố -ing
  if (w.endsWith("ing") && w.length > 4) {
    const base = w.slice(0, -3);
    // Doubled consonant: running -> run, swimming -> swim, shopping -> shop, planning -> plan
    if (/(.)\1$/.test(base) && !/([aeiou])\1$/.test(base)) {
      candidates.push(base.slice(0, -1));
    }
    // Direct strip: playing -> play, walking -> walk, singing -> sing
    candidates.push(base);
    // Silent e: making -> make, dancing -> dance, writing -> write
    candidates.push(base + "e");
    // -ying -> -ie: dying -> die, lying -> lie, tying -> tie
    if (w.endsWith("ying") && w.length > 5) {
      candidates.push(w.slice(0, -4) + "ie");
    }
  }

  // 2. Hậu tố -ed
  if (w.endsWith("ed") && w.length > 3) {
    // -ied -> -y: studied -> study, copied -> copy
    if (w.endsWith("ied")) {
      candidates.push(w.slice(0, -3) + "y");
    }
    const base = w.slice(0, -2);
    // Doubled consonant: stopped -> stop, planned -> plan, robbed -> rob
    if (/(.)\1$/.test(base) && !/([aeiou])\1$/.test(base)) {
      candidates.push(base.slice(0, -1));
    }
    // Ending in e before d (strip only -d): validated -> validate, created -> create, lived -> live
    candidates.push(w.slice(0, -1));
    // Direct strip: tested -> test, walked -> walk
    candidates.push(base);
    candidates.push(base + "e");
  }

  // 3. Hậu tố -es / -s
  if (w.endsWith("ses") && w.length > 4) {
    // hypotheses -> hypothesis, analyses -> analysis, crises -> crisis, theses -> thesis
    candidates.push(w.slice(0, -3) + "sis");
  }

  if (w.endsWith("ies") && w.length > 4) {
    // varieties -> variety, cities -> city, studies -> study
    candidates.push(w.slice(0, -3) + "y");
  }

  if (w.endsWith("ves") && w.length > 4) {
    // wolves -> wolf, knives -> knife, halves -> half, leaves -> leaf
    candidates.push(w.slice(0, -3) + "f");
    candidates.push(w.slice(0, -3) + "fe");
  }

  if (/(?:ch|sh|ss|x|z|o)es$/.test(w) && w.length > 3) {
    // boxes -> box, watches -> watch, dishes -> dish, tomatoes -> tomato
    candidates.push(w.slice(0, -2));
    candidates.push(w.slice(0, -1));
  } else if (w.endsWith("es") && w.length > 3) {
    // apples -> apple, tables -> table, notes -> note
    candidates.push(w.slice(0, -1));
    candidates.push(w.slice(0, -2));
  } else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 2) {
    // cats -> cat, books -> book, dogs -> dog
    candidates.push(w.slice(0, -1));
  }

  // Loại bỏ các candidate trùng lặp hoặc rỗng hoặc giống hệt từ ban đầu
  return Array.from(new Set(candidates)).filter((c) => c.length > 1 && c !== w);
}

export class FreeDictService extends BaseProvider {
  private preferredAccent: "us" | "uk";

  constructor(preferredAccent: "us" | "uk" = "us") {
    super();
    this.preferredAccent = preferredAccent;
  }

  /**
   * Tra cứu từ trong Free Dictionary API (dictionaryapi.dev)
   * 1. Query: https://api.dictionaryapi.dev/api/v2/entries/en/{word}
   * 2. Bóc tách:
   *    - phonetic: lấy từ entry.phonetic hoặc phonetics[].text
   *    - audioUrl: ưu tiên tìm file .mp3 có đuôi -us.mp3 hoặc -uk.mp3 từ phonetics[].audio
   *    - definitions: mảng DictDefinition ({ partOfSpeech, meaningEn, example })
   * 3. Xử lý từ chia thì/số nhiều (Inflection Fallback):
   *    - Nếu API trả về 404 (không tìm thấy):
   *      + Thử bỏ hậu tố: -ing, -ed, -es/-s...
   *      + Nếu tra từ gốc thành công: gán isStemFallback = true, originalQuery = word.
   * 4. Trả về null nếu không tìm thấy hoặc lỗi mạng.
   */
  async lookup(word: string, accent?: "us" | "uk"): Promise<FreeDictResult | null> {
    const cleanWord = word ? word.trim().toLowerCase() : "";
    if (!cleanWord) {
      return null;
    }

    const apiUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`;
    const res = await this.executeRequest(apiUrl);

    const json = this.extractJson(res);
    if (res && res.status === 200 && Array.isArray(json) && json.length > 0) {
      const parsed = this.parseEntries(json, cleanWord, accent);
      if (parsed) {
        // Missing pronunciation stays missing; a lemma's sound is not the inflected word.
        return parsed;
      }
    }

    // Nếu gặp 404: Thử danh sách stem candidates
    if (res && res.status === 404) {
      const candidates = getStemCandidates(cleanWord);
      for (const candidate of candidates) {
        const stemUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(candidate)}`;
        const stemRes = await this.executeRequest(stemUrl);
        const stemJson = this.extractJson(stemRes);

        if (stemRes && stemRes.status === 200 && Array.isArray(stemJson) && stemJson.length > 0) {
          const parsed = this.parseEntries(stemJson, candidate, accent);
          if (parsed) {
            return {
              ...parsed,
              isStemFallback: true,
              originalQuery: word,
            };
          }
        }
      }
    }

    return null;
  }

  private extractJson(res: any): any {
    if (!res) return null;
    if (res.json !== undefined && res.json !== null) {
      return res.json;
    }
    if (res.text) {
      try {
        return JSON.parse(res.text);
      } catch {
        return null;
      }
    }
    return null;
  }

  private parseEntries(
    entries: any[],
    queryWord: string,
    accent?: "us" | "uk"
  ): FreeDictResult | null {
    if (!Array.isArray(entries) || entries.length === 0) {
      return null;
    }

    const primaryEntry = entries[0];
    const word = primaryEntry.word || queryWord;

    // 1. Bóc tách phonetic
    let phonetic: string | undefined = primaryEntry.phonetic;
    if (!phonetic) {
      for (const entry of entries) {
        if (typeof entry.phonetic === "string" && entry.phonetic.trim()) {
          phonetic = entry.phonetic.trim();
          break;
        }
        if (Array.isArray(entry.phonetics)) {
          const found = entry.phonetics.find(
            (p: any) => typeof p?.text === "string" && p.text.trim().length > 0
          );
          if (found) {
            phonetic = found.text.trim();
            break;
          }
        }
      }
    }

    // 2. Bóc tách audioUrl
    let audioUrl: string | undefined;
    const allAudios: string[] = [];
    for (const entry of entries) {
      if (Array.isArray(entry.phonetics)) {
        for (const p of entry.phonetics) {
          if (typeof p?.audio === "string" && p.audio.trim().length > 0) {
            let a = p.audio.trim();
            if (a.startsWith("//")) {
              a = "https:" + a;
            }
            allAudios.push(a);
          }
        }
      }
    }

    if (allAudios.length > 0) {
      const usAudio = allAudios.find(
        (a) => a.includes("-us.mp3") || a.endsWith("-us.mp3")
      );
      const ukAudio = allAudios.find(
        (a) => a.includes("-uk.mp3") || a.endsWith("-uk.mp3")
      );

      const targetAccent = accent || this.preferredAccent;
      if (targetAccent === "uk") {
        audioUrl =
          ukAudio ||
          usAudio ||
          allAudios.find((a) => a.endsWith(".mp3")) ||
          allAudios[0];
      } else {
        audioUrl =
          usAudio ||
          ukAudio ||
          allAudios.find((a) => a.endsWith(".mp3")) ||
          allAudios[0];
      }
    }

    // 3. Bóc tách definitions
    const definitions: DictDefinition[] = [];
    for (const entry of entries) {
      if (Array.isArray(entry.meanings)) {
        for (const m of entry.meanings) {
          const partOfSpeech =
            typeof m?.partOfSpeech === "string" ? m.partOfSpeech.trim() : "";
          if (Array.isArray(m?.definitions)) {
            for (const d of m.definitions) {
              if (d && typeof d.definition === "string" && d.definition.trim()) {
                const defItem: DictDefinition = {
                  partOfSpeech,
                  meaningEn: d.definition.trim(),
                };
                if (typeof d.example === "string" && d.example.trim()) {
                  defItem.example = d.example.trim();
                }
                definitions.push(defItem);
              }
            }
          }
        }
      }
    }

    return {
      word,
      ...(phonetic ? { phonetic } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      definitions,
    };
  }
}
