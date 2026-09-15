import { describe, expect, it } from "vite-plus/test";
import { grade } from "./grade.ts";
import type { AdjEntry, Entry, NounEntry, NumberEntry, VerbEntry } from "./schema.ts";

const base = { tags: ["test"], added: "2026-09-15" };

const simpatico: AdjEntry = {
  ...base,
  id: "simpatico",
  es: "simpático",
  en: ["nice", "friendly", "likeable"],
  pos: "adj",
  forms: { f: "simpática" },
  notes: "False friend — not 'sympathetic'.",
};

const inteligente: AdjEntry = {
  ...base,
  id: "inteligente",
  es: "inteligente",
  en: ["intelligent", "smart"],
  pos: "adj",
};

const abuelo: NounEntry = {
  ...base,
  id: "abuelo",
  es: "abuelo",
  en: ["grandfather"],
  pos: "noun",
  gender: "m",
  forms: { f: "abuela", pl: "abuelos" },
};

const mujer: NounEntry = {
  ...base,
  id: "mujer",
  es: "mujer",
  en: ["woman", "wife"],
  pos: "noun",
  gender: "f",
  forms: { pl: "mujeres" },
};

const nino: NounEntry = {
  ...base,
  id: "nino",
  es: "niño",
  en: ["boy", "child"],
  pos: "noun",
  gender: "m",
  forms: { f: "niña", pl: "niños" },
};

const acostarse: VerbEntry = {
  ...base,
  id: "acostarse",
  es: "acostarse",
  en: ["to go to bed"],
  pos: "verb",
  verb: { reflexive: true, regular: false, stemChange: "o→ue" },
  forms: { yo: "me acuesto" },
};

const quinientos: NumberEntry = {
  ...base,
  id: "quinientos",
  es: "quinientos",
  en: ["five hundred", "500"],
  pos: "number",
  value: 500,
  forms: { f: "quinientas" },
};

const aMenudo: Entry = {
  ...base,
  id: "a-menudo",
  es: "a menudo",
  en: ["often"],
  pos: "adv",
};

describe("en→es normalization", () => {
  it("ignores case, surrounding space and trailing punctuation", () => {
    expect(grade(simpatico, "en→es", "  SIMPÁTICO.  ").result).toBe("correct");
  });

  it("collapses internal whitespace", () => {
    expect(grade(aMenudo, "en→es", "a    menudo").result).toBe("correct");
  });

  it("marks an empty answer wrong", () => {
    expect(grade(simpatico, "en→es", "   ").result).toBe("wrong");
  });
});

describe("en→es accents", () => {
  it("downgrades a missing accent to hard with a note", () => {
    const result = grade(simpatico, "en→es", "simpatico");
    expect(result.result).toBe("hard");
    expect(result.note).toContain("check the accent");
  });

  it("names ñ specifically rather than calling it an accent", () => {
    const result = grade(nino, "en→es", "nino");
    expect(result.result).toBe("hard");
    expect(result.note).toContain("check the ñ");
  });

  it("accepts a correctly accented answer as correct", () => {
    expect(grade(nino, "en→es", "niño").result).toBe("correct");
  });
});

describe("en→es adjective forms", () => {
  it("accepts the feminine form of a variable adjective", () => {
    expect(grade(simpatico, "en→es", "simpática").result).toBe("correct");
  });

  it("accepts learner shorthand with a slash", () => {
    expect(grade(simpatico, "en→es", "simpático/a").result).toBe("correct");
  });

  it("accepts an invariable adjective", () => {
    expect(grade(inteligente, "en→es", "inteligente").result).toBe("correct");
  });

  it("rejects an invented feminine for an invariable adjective", () => {
    expect(grade(inteligente, "en→es", "inteligenta").result).toBe("wrong");
  });
});

describe("en→es nouns and articles", () => {
  it("accepts a bare noun when the article was not asked for", () => {
    expect(grade(abuelo, "en→es", "abuelo").result).toBe("correct");
  });

  it("accepts the correct article when the article was not asked for", () => {
    expect(grade(abuelo, "en→es", "el abuelo").result).toBe("correct");
  });

  it("downgrades a missing article to hard when the article was asked for", () => {
    const result = grade(abuelo, "en→es", "abuelo", { requireArticle: true });
    expect(result.result).toBe("hard");
    expect(result.note).toContain("include the article");
  });

  it("accepts the article when asked for", () => {
    expect(grade(abuelo, "en→es", "el abuelo", { requireArticle: true }).result).toBe("correct");
  });

  it("marks a wrong article wrong when gender was being tested", () => {
    const result = grade(abuelo, "en→es", "la abuelo", { requireArticle: true });
    expect(result.result).toBe("wrong");
    expect(result.note).toContain("masculine");
  });

  it("marks a wrong article only hard when gender was not being tested", () => {
    expect(grade(abuelo, "en→es", "la abuelo").result).toBe("hard");
  });

  it("accepts the plural form as an inflection", () => {
    expect(grade(abuelo, "en→es", "los abuelos").result).toBe("correct");
  });

  it("handles feminine nouns", () => {
    expect(grade(mujer, "en→es", "la mujer", { requireArticle: true }).result).toBe("correct");
    expect(grade(mujer, "en→es", "el mujer", { requireArticle: true }).result).toBe("wrong");
  });

  it("does not silently accept the other-gender noun as correct", () => {
    const result = grade(abuelo, "en→es", "abuela");
    expect(result.result).toBe("hard");
    expect(result.note).toContain("feminine");
  });
});

describe("en→es verbs", () => {
  it("accepts the infinitive", () => {
    expect(grade(acostarse, "en→es", "acostarse").result).toBe("correct");
  });

  it("flags a dropped reflexive pronoun", () => {
    const result = grade(acostarse, "en→es", "acostar");
    expect(result.result).toBe("hard");
    expect(result.note).toContain("reflexive");
  });

  it("does not silently accept a conjugated form as correct", () => {
    const result = grade(acostarse, "en→es", "me acuesto");
    expect(result.result).toBe("hard");
    expect(result.note).toContain("yo form");
  });
});

describe("multi-word reflexive verbs", () => {
  const lavarse: VerbEntry = {
    ...base,
    id: "lavarse-los-dientes",
    es: "lavarse los dientes",
    en: ["to brush one's teeth"],
    pos: "verb",
    verb: { reflexive: true, regular: true },
    forms: { yo: "me lavo los dientes" },
  };

  it("accepts the full phrase", () => {
    expect(grade(lavarse, "en→es", "lavarse los dientes").result).toBe("correct");
  });

  it("flags a dropped reflexive pronoun on the first word", () => {
    const result = grade(lavarse, "en→es", "lavar los dientes");
    expect(result.result).toBe("hard");
    expect(result.note).toContain("reflexive");
  });

  it("does not silently accept a conjugated phrase", () => {
    expect(grade(lavarse, "en→es", "me lavo los dientes").result).toBe("hard");
  });
});

describe("en→es numbers", () => {
  it("accepts the feminine form", () => {
    expect(grade(quinientos, "en→es", "quinientas").result).toBe("correct");
  });
});

describe("es→en", () => {
  it("accepts any listed english answer", () => {
    expect(grade(simpatico, "es→en", "friendly").result).toBe("correct");
    expect(grade(simpatico, "es→en", "likeable").result).toBe("correct");
  });

  it("strips a leading infinitive marker", () => {
    expect(grade(acostarse, "es→en", "go to bed").result).toBe("correct");
    expect(grade(acostarse, "es→en", "to go to bed").result).toBe("correct");
  });

  it("strips a leading article", () => {
    expect(grade(abuelo, "es→en", "the grandfather").result).toBe("correct");
  });

  it("reports the canonical answer when wrong", () => {
    const result = grade(simpatico, "es→en", "sympathetic");
    expect(result.result).toBe("wrong");
    expect(result.expected).toBe("nice");
    expect(result.note).toContain("False friend");
  });

  it("accepts a numeric answer when listed", () => {
    expect(grade(quinientos, "es→en", "500").result).toBe("correct");
  });
});
