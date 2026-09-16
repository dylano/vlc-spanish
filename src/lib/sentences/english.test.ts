import { describe, expect, it } from "vite-plus/test";
import { indefiniteArticle, inflectVerb, pluralize, subjectPronoun } from "./english.ts";

describe("english verbs", () => {
  it("leaves the base form for every subject but the third person singular", () => {
    expect(inflectVerb("to get up", "yo")).toBe("get up");
    expect(inflectVerb("to get up", "vosotros")).toBe("get up");
    expect(inflectVerb("to get up", "ellos")).toBe("get up");
    expect(inflectVerb("to get up", "el")).toBe("gets up");
  });

  it("handles the common irregulars and spelling rules", () => {
    expect(inflectVerb("to have lunch", "el")).toBe("has lunch");
    expect(inflectVerb("to do sport", "el")).toBe("does sport");
    expect(inflectVerb("to go to bed", "el")).toBe("goes to bed");
    expect(inflectVerb("to brush one's teeth", "el", "f")).toBe("brushes her teeth");
    expect(inflectVerb("to study", "el")).toBe("studies");
    expect(inflectVerb("to play", "el")).toBe("plays");
  });

  it("conjugates be", () => {
    expect(inflectVerb("to be called", "yo")).toBe("am called");
    expect(inflectVerb("to be called", "tu")).toBe("are called");
    expect(inflectVerb("to be called", "el")).toBe("is called");
    expect(inflectVerb("to be called", "nosotros")).toBe("are called");
  });

  it("fills in one's for the subject", () => {
    expect(inflectVerb("to brush one's teeth", "yo")).toBe("brush my teeth");
    expect(inflectVerb("to brush one's teeth", "nosotros")).toBe("brush our teeth");
    expect(inflectVerb("to brush one's teeth", "el", "m")).toBe("brushes his teeth");
    expect(inflectVerb("to brush one's teeth", "el", "mf")).toBe("brush their teeth");
  });

  it("marks plural you, which English cannot otherwise show", () => {
    expect(subjectPronoun("tu")).toBe("you");
    expect(subjectPronoun("vosotros")).toBe("you (plural)");
    expect(subjectPronoun("el", "f")).toBe("she");
  });
});

describe("english nouns", () => {
  it("pluralizes the last word of a phrase", () => {
    expect(pluralize("brother")).toBe("brothers");
    expect(pluralize("fashion designer")).toBe("fashion designers");
    expect(pluralize("secretary")).toBe("secretaries");
    expect(pluralize("church")).toBe("churches");
    expect(pluralize("wife")).toBe("wives");
    expect(pluralize("Monday")).toBe("Mondays");
  });

  it("chooses a or an by sound", () => {
    expect(indefiniteArticle("nurse")).toBe("a");
    expect(indefiniteArticle("athlete")).toBe("an");
    expect(indefiniteArticle("university")).toBe("a");
    expect(indefiniteArticle("hour")).toBe("an");
  });
});
