import { describe, expect, it } from "vite-plus/test";
import { articleRequired, grade } from "./grade.ts";
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

describe("es→en apostrophes", () => {
  const haceCalor: Entry = {
    ...base,
    id: "hace-calor",
    es: "hace calor",
    en: ["it's hot", "it is hot"],
    pos: "phrase",
  };

  it("accepts a curly apostrophe, as iOS types it, or none at all", () => {
    expect(grade(haceCalor, "es→en", "It’s hot").result).toBe("correct");
    expect(grade(haceCalor, "es→en", "its hot").result).toBe("correct");
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

  it("accepts every plural, stored or regular", () => {
    expect(grade(simpatico, "en→es", "simpáticos").result).toBe("correct");
    expect(grade(simpatico, "en→es", "simpáticas").result).toBe("correct");
    expect(grade(inteligente, "en→es", "inteligentes").result).toBe("correct");
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

describe("nouns with a feminine form", () => {
  const asked = { requireArticle: true };
  const enfermero: NounEntry = {
    ...base,
    id: "enfermero",
    es: "enfermero",
    en: ["nurse"],
    enF: ["nurse"],
    pos: "noun",
    gender: "m",
    forms: { f: "enfermera", pl: "enfermeros" },
  };

  it("accepts either gender when both answer to the same English", () => {
    expect(grade(enfermero, "en→es", "la enfermera", asked).result).toBe("correct");
    expect(grade(enfermero, "en→es", "el enfermero", asked).result).toBe("correct");
  });

  it("judges by the gloss the prompt showed, when it knows it", () => {
    const nieto: NounEntry = {
      ...base,
      id: "nieto",
      es: "nieto",
      en: ["grandson", "grandchild"],
      enF: ["granddaughter", "grandchild"],
      pos: "noun",
      gender: "m",
      forms: { f: "nieta", pl: "nietos" },
    };
    expect(grade(nieto, "en→es", "la nieta", { ...asked, prompt: "grandchild" }).result).toBe(
      "correct",
    );
    expect(grade(nieto, "en→es", "la nieta", { ...asked, prompt: "grandson" }).result).toBe("hard");
  });

  it("still calls the other gender almost when the English differs", () => {
    const result = grade(abuelo, "en→es", "la abuela", asked);
    expect(result.result).toBe("hard");
    expect(result.note).toContain("the feminine");
  });
});

describe("nouns whose headword is plural", () => {
  const asked = { requireArticle: true };
  const hermanos: NounEntry = {
    ...base,
    id: "hermanos",
    es: "hermanos",
    en: ["siblings"],
    pos: "noun",
    gender: "m",
    number: "pl",
  };

  it("takes the plural article", () => {
    expect(grade(hermanos, "en→es", "los hermanos", asked)).toEqual({
      result: "correct",
      expected: "los hermanos",
    });
  });

  it("marks a singular article as a mistake, naming the plural one", () => {
    const result = grade(hermanos, "en→es", "el hermanos", asked);
    expect(result.result).toBe("wrong");
    expect(result.note).toContain("los hermanos");
  });

  it("asks for the plural article when it is missing", () => {
    const result = grade(hermanos, "en→es", "hermanos", asked);
    expect(result.result).toBe("hard");
    expect(result.note).toContain("los hermanos");
  });
});

describe("common-gender nouns", () => {
  const asked = { requireArticle: true };
  const estudiante: NounEntry = {
    ...base,
    id: "estudiante",
    es: "estudiante",
    en: ["student"],
    pos: "noun",
    gender: "mf",
    forms: { pl: "estudiantes" },
  };

  it("accepts either article", () => {
    expect(grade(estudiante, "en→es", "el estudiante", asked).result).toBe("correct");
    expect(grade(estudiante, "en→es", "la estudiante", asked).result).toBe("correct");
    expect(grade(estudiante, "en→es", "las estudiantes", asked).result).toBe("correct");
  });

  it("shows both articles in the answer", () => {
    expect(grade(estudiante, "en→es", "la estudiante", asked).expected).toBe("el/la estudiante");
    expect(grade(estudiante, "en→es", "el/la estudiante", asked).result).toBe("correct");
  });

  it("still asks for an article, naming both", () => {
    const result = grade(estudiante, "en→es", "estudiante", asked);
    expect(result.result).toBe("hard");
    expect(result.note).toContain("el/la estudiante");
  });

  it("does not accept a plural article on the singular", () => {
    expect(grade(estudiante, "en→es", "los estudiante", asked).result).toBe("wrong");
  });
});

describe("nouns with their own article usage", () => {
  const asked = { requireArticle: true };
  const enero: NounEntry = {
    ...base,
    id: "enero",
    es: "enero",
    en: ["January"],
    pos: "noun",
    gender: "m",
    article: "none",
  };
  const lunes: NounEntry = {
    ...base,
    id: "lunes",
    es: "lunes",
    en: ["Monday"],
    pos: "noun",
    gender: "m",
    article: "optional",
  };

  it("does not ask for the article on a noun used bare", () => {
    expect(articleRequired(enero, asked)).toBe(false);
    expect(grade(enero, "en→es", "enero", asked)).toEqual({ result: "correct", expected: "enero" });
  });

  it("still accepts the article on a noun used bare", () => {
    expect(grade(enero, "en→es", "el enero", asked).result).toBe("correct");
  });

  it("accepts an optional article either way, and shows it in the answer", () => {
    expect(articleRequired(lunes, asked)).toBe(false);
    expect(grade(lunes, "en→es", "lunes", asked)).toEqual({
      result: "correct",
      expected: "el lunes",
    });
    expect(grade(lunes, "en→es", "el lunes", asked).result).toBe("correct");
  });

  it("still notices a wrong article when one is optional", () => {
    const result = grade(lunes, "en→es", "la lunes", asked);
    expect(result.result).toBe("hard");
    expect(result.note).toContain("masculine");
  });

  it("requires the article by default", () => {
    expect(articleRequired(abuelo, asked)).toBe(true);
    expect(articleRequired(abuelo)).toBe(false);
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

  it("names the gender of the form given, not the headword", () => {
    const result = grade(abuelo, "en→es", "el abuela", { requireArticle: true });
    expect(result.note).toContain("abuela is feminine: la abuela");
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
  it("accepts the meaning of another entry with the same headword", () => {
    const sporty: AdjEntry = {
      ...base,
      id: "deportista",
      es: "deportista",
      en: ["sporty"],
      pos: "adj",
    };
    const athlete: NounEntry = {
      ...base,
      id: "deportista-2",
      es: "deportista",
      en: ["athlete"],
      pos: "noun",
      gender: "mf",
    };
    const dictionary = [sporty, athlete, simpatico];
    expect(grade(sporty, "es→en", "athlete", { dictionary })).toEqual({
      result: "correct",
      expected: "sporty",
    });
    expect(grade(athlete, "es→en", "sporty", { dictionary }).result).toBe("correct");
    // Only a shared headword counts, not any word in the dictionary.
    expect(grade(sporty, "es→en", "friendly", { dictionary }).result).toBe("wrong");
  });

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

describe("near misses", () => {
  const dictionary: Entry[] = [simpatico, abuelo, mujer, nino, acostarse, quinientos, aMenudo];

  const junio: Entry = {
    ...base,
    id: "junio",
    es: "junio",
    en: ["June"],
    pos: "noun",
    gender: "m",
  };
  const julio: Entry = {
    ...base,
    id: "julio",
    es: "julio",
    en: ["July"],
    pos: "noun",
    gender: "m",
  };

  const lavarse: VerbEntry = {
    ...base,
    id: "lavarse-los-dientes",
    es: "lavarse los dientes",
    en: ["to brush one's teeth"],
    pos: "verb",
    verb: { reflexive: true, regular: true },
  };

  it("forgives a transposed letter as a spelling slip", () => {
    const result = grade(lavarse, "en→es", "lavarse los dienets", { dictionary });
    expect(result.result).toBe("hard");
    expect(result.note).toContain("spelling");
  });

  it("forgives a single dropped letter", () => {
    const result = grade(aMenudo, "en→es", "a menud", { dictionary });
    expect(result.result).toBe("hard");
  });

  it("does not forgive a wrong article inside a phrase", () => {
    const result = grade(lavarse, "en→es", "lavarse las dientes", { dictionary });
    expect(result.result).toBe("wrong");
    expect(result.note).toContain("los");
  });

  it("does not forgive a different real word one edit away", () => {
    // junio and julio differ by one letter but are different months; treating
    // that as a typo would quietly mark a real mistake correct-ish.
    const result = grade(junio, "en→es", "julio", { dictionary: [junio, julio] });
    expect(result.result).toBe("wrong");
    expect(result.note).toContain("July");
  });

  it("names the word the learner actually wrote", () => {
    const result = grade(junio, "en→es", "julio", { dictionary: [junio, julio] });
    expect(result.note).toContain("julio");
  });

  it("still marks an unrelated answer wrong", () => {
    expect(grade(aMenudo, "en→es", "montaña", { dictionary }).result).toBe("wrong");
  });

  it("does not forgive two or more slipped letters", () => {
    expect(grade(aMenudo, "en→es", "a mnedo", { dictionary }).result).toBe("wrong");
  });

  it("treats an empty answer as wrong, not as a near miss", () => {
    expect(grade(aMenudo, "en→es", "", { dictionary }).result).toBe("wrong");
  });

  it("forgives a slipped letter in an english answer", () => {
    const result = grade(abuelo, "es→en", "grandfathr");
    expect(result.result).toBe("hard");
    expect(result.note).toContain("spelling");
  });

  it("keeps an exact answer correct when a dictionary is supplied", () => {
    expect(grade(abuelo, "en→es", "el abuelo", { dictionary }).result).toBe("correct");
  });
});
