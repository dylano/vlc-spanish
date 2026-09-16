/**
 * The small amount of English grammar sentence rendering needs. Frames supply
 * word order; this supplies the forms that change with the subject or number.
 */

/** Grammatical subjects, keyed like verb `forms` in the dictionary. */
export const SUBJECTS = ["yo", "tu", "el", "nosotros", "vosotros", "ellos"] as const;
export type Subject = (typeof SUBJECTS)[number];

/** Gender of a third-person subject, for his/her. "mf" reads as their. */
export type SubjectGender = "m" | "f" | "mf";

const PRONOUN: Record<Subject, string> = {
  yo: "I",
  tu: "you",
  el: "he",
  nosotros: "we",
  // English "you" cannot tell tú from vosotros, so the plural is marked.
  vosotros: "you (plural)",
  ellos: "they",
};

export function subjectPronoun(subject: Subject, gender: SubjectGender = "m"): string {
  if (subject === "el") return gender === "f" ? "she" : gender === "mf" ? "they" : "he";
  return PRONOUN[subject];
}

function possessive(subject: Subject, gender: SubjectGender): string {
  switch (subject) {
    case "yo":
      return "my";
    case "tu":
    case "vosotros":
      return "your";
    case "el":
      return gender === "f" ? "her" : gender === "mf" ? "their" : "his";
    case "nosotros":
      return "our";
    case "ellos":
      return "their";
  }
}

const IRREGULAR_THIRD: Record<string, string> = { be: "is", have: "has", do: "does", go: "goes" };

function thirdPerson(verb: string): string {
  if (IRREGULAR_THIRD[verb]) return IRREGULAR_THIRD[verb];
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

/**
 * Inflect an English infinitive gloss ("to brush one's teeth") for a subject:
 * "brushes her teeth". Only the first word changes, plus "one's".
 */
export function inflectVerb(gloss: string, subject: Subject, gender: SubjectGender = "m"): string {
  const [verb = "", ...rest] = gloss.replace(/^to\s+/, "").split(" ");
  let head = verb;
  if (verb === "be") {
    head = subject === "yo" ? "am" : subject === "el" && gender !== "mf" ? "is" : "are";
  } else if (subject === "el" && gender !== "mf") {
    head = thirdPerson(verb);
  }
  return [head, ...rest].join(" ").replace(/\bone's\b/g, possessive(subject, gender));
}

const IRREGULAR_PLURAL: Record<string, string> = {
  man: "men",
  woman: "women",
  child: "children",
  person: "people",
  wife: "wives",
};

/** Plural of an English noun phrase; only the last word changes ("fashion designers"). */
export function pluralize(noun: string): string {
  const words = noun.split(" ");
  const last = words.pop() ?? "";
  let plural: string;
  if (IRREGULAR_PLURAL[last]) plural = IRREGULAR_PLURAL[last];
  else if (/(s|sh|ch|x|z)$/.test(last)) plural = `${last}es`;
  else if (/[^aeiou]y$/.test(last)) plural = `${last.slice(0, -1)}ies`;
  else plural = `${last}s`;
  return [...words, plural].join(" ");
}

/** "a" or "an" before a noun phrase, by its sound rather than its first letter. */
export function indefiniteArticle(noun: string): "a" | "an" {
  const lower = noun.toLowerCase();
  if (/^(uni|use|usu|eu|one)/.test(lower)) return "a";
  if (/^(hour|honest|honour|honor)/.test(lower)) return "an";
  return /^[aeiou]/.test(lower) ? "an" : "a";
}
