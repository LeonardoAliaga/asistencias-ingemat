// Answer keys are deliberately excluded. Section IDs are editor identifiers;
// the academic ranges, rules, scores and booklet orders define the structure.
function structureOf(definition) {
  return JSON.stringify({
    totalQuestions: definition.totalQuestions,
    areas: definition.areas,
    sections: definition.sections.map(
      ({ name, questions, rules, scoring }) => ({
        name,
        questions,
        rules,
        scoring,
      }),
    ),
    scoring: definition.scoring,
    forms: definition.forms,
    maxGrade: definition.maxGrade,
  });
}
module.exports = { structureOf };
