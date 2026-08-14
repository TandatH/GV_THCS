export type TeachingAssignment = {
  subjectId: string;
  gradeLevels: number[];
};

type DataRow = Record<string, unknown> & { id?: string };

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function classGrade(row: DataRow | null | undefined): number | null {
  if (!row) return null;
  const raw = row.grade ?? row.gradeLevel ?? row.khoi;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

export function teacherSubjectIds(row: DataRow | null | undefined): string[] {
  if (!row) return [];
  if (Array.isArray(row.subjectIds)) return row.subjectIds.map(String).filter(Boolean);
  return textValue(row.subjectIds).split(",").map((value) => value.trim()).filter(Boolean);
}

export function teachingAssignments(row: DataRow | null | undefined): TeachingAssignment[] {
  if (!row || !Array.isArray(row.teachingAssignments)) return [];
  return row.teachingAssignments.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const input = item as Record<string, unknown>;
    const subjectId = textValue(input.subjectId);
    if (!subjectId) return [];
    const gradeLevels = Array.isArray(input.gradeLevels)
      ? [...new Set(input.gradeLevels.map(Number).filter((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 12))].sort((a, b) => a - b)
      : [];
    return [{ subjectId, gradeLevels }];
  });
}

export function teacherCanTeachSubject(row: DataRow | null | undefined, subjectId: string) {
  if (!subjectId) return true;
  const subjects = teacherSubjectIds(row);
  return subjects.length === 0 || subjects.includes(subjectId);
}

/**
 * Backwards-compatible rule:
 * - subjectIds is still the primary subject permission.
 * - If a teachingAssignments entry exists for that subject and has gradeLevels,
 *   the class grade must be in that list.
 * - Legacy teacher records without teachingAssignments remain usable for all
 *   grades of their assigned subject until an admin narrows the scope.
 */
export function teacherCanTeachClass(
  teacher: DataRow | null | undefined,
  subjectId: string,
  schoolClass: DataRow | null | undefined,
) {
  if (!teacherCanTeachSubject(teacher, subjectId)) return false;
  if (!subjectId || !schoolClass) return true;

  const assignment = teachingAssignments(teacher).find((item) => item.subjectId === subjectId);
  if (!assignment || assignment.gradeLevels.length === 0) return true;

  const grade = classGrade(schoolClass);
  return grade == null || assignment.gradeLevels.includes(grade);
}

export function gradeScopeForSubject(row: DataRow | null | undefined, subjectId: string): number[] {
  return teachingAssignments(row).find((item) => item.subjectId === subjectId)?.gradeLevels ?? [];
}
