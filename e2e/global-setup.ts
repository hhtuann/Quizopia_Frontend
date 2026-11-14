import { promises as fs } from "node:fs";
import { registerVerifiedUser, apiJson, loginViaApi, API, type SmokeState } from "./helpers";

/**
 * Seeds ALL smoke data through the real REST API (no SQL, no fixtures):
 * teacher + class-member student + stranger student (real registration with
 * Mailpit OTP), a classroom, a question bank with two imported questions,
 * and a PUBLISHED exam — then persists the ids for the scenario specs.
 */
export default async function globalSetup(): Promise<void> {
  const health = await fetch(`${API}/actuator/health`);
  if (!health.ok) throw new Error(`backend not healthy at ${API}`);
  const teacherAsStudent = await registerVerifiedUser("STUDENT", "teacher");
  // Public registration is STUDENT-only (Identity-M1); TEACHER is granted by
  // the authenticated self-upgrade flow (Identity-M2) — the real dev path.
  const upgrade = await apiJson<{ roles: string[] }>(
    "/api/auth/upgrade-teacher",
    teacherAsStudent.accessToken,
    { method: "POST", body: JSON.stringify({}) }
  );
  if (upgrade.status !== 200 || !(upgrade.body?.roles ?? []).includes("TEACHER")) {
    throw new Error(`teacher upgrade failed: ${upgrade.status} ${upgrade.raw}`);
  }
  const teacher = { ...teacherAsStudent, accessToken: (await loginViaApi(teacherAsStudent.email, teacherAsStudent.password)).accessToken };
  const student = await registerVerifiedUser("STUDENT", "student");
  const stranger = await registerVerifiedUser("STUDENT", "stranger");
  // Classroom + membership.
  const classroom = await apiJson<{ id: number; name: string }>("/api/classrooms", teacher.accessToken, {
    method: "POST",
    body: JSON.stringify({
      code: `SMK${Date.now().toString(36).toUpperCase()}`,
      name: "P4-A Smoke Class",
      description: "browser smoke",
    }),
  });
  if (classroom.status !== 201 || !classroom.body) {
    throw new Error(`classroom create failed: ${classroom.status} ${classroom.raw}`);
  }
  const added = await apiJson(
    `/api/classrooms/${classroom.body.id}/members`,
    teacher.accessToken,
    { method: "POST", body: JSON.stringify({ userIds: [student.id] }) }
  );
  if (added.status >= 300) throw new Error(`member add failed: ${added.status} ${added.raw}`);

  // Question bank + two SINGLE_CHOICE questions via the markdown importer.
  const bank = await apiJson<{ id: number }>("/api/question-banks", teacher.accessToken, {
    method: "POST",
    body: JSON.stringify({
      code: `SMKBANK${Date.now().toString(36).toUpperCase()}`,
      name: "P4-A Smoke Bank",
      description: "browser smoke",
    }),
  });
  if (bank.status !== 201 || !bank.body) {
    throw new Error(`bank create failed: ${bank.status} ${bank.raw}`);
  }
  const markdown = [
    "Question 1 [SINGLE_CHOICE]: What is 2 + 2?",
    "*A. 4",
    "B. 3",
    "C. 5",
    "D. 6",
    "",
    "Question 2 [SINGLE_CHOICE]: Capital of France?",
    "A. Berlin",
    "*B. Paris",
    "C. Madrid",
    "D. Rome",
    "",
  ].join("\n");
  const imported = await apiJson<{ imported: number }>(
    `/api/question-banks/${bank.body.id}/questions/import-markdown`,
    teacher.accessToken,
    { method: "POST", body: JSON.stringify({ markdown }) }
  );
  if (imported.status !== 200 || !imported.body || imported.body.imported < 2) {
    throw new Error(`markdown import failed: ${imported.status} ${imported.raw}`);
  }
  const bankQuestions = await apiJson<{ items: Array<{ id: number }> }>(
    `/api/question-banks/${bank.body.id}/questions?page=0&size=10`,
    teacher.accessToken
  );
  const questionIds = (bankQuestions.body?.items ?? []).map((q) => q.id);
  if (questionIds.length < 2) throw new Error(`expected 2 questions, got ${questionIds.length}`);

  // Exam + composition + publish.
  const exam = await apiJson<{ id: number; examVersion: number }>(
    "/api/exams",
    teacher.accessToken,
    {
      method: "POST",
      body: JSON.stringify({ title: "P4-A Smoke Exam", description: "browser smoke" }),
    }
  );
  if (exam.status !== 201 || !exam.body) {
    throw new Error(`exam create failed: ${exam.status} ${exam.raw}`);
  }
  // ExamListItem carries no version field — read the optimistic token from
  // the editor view (the same call the UI makes).
  const editor = await apiJson<{ examVersion: number }>(
    `/api/exams/${exam.body.id}`,
    teacher.accessToken
  );
  if (editor.status !== 200 || editor.body == null) {
    throw new Error(`exam detail failed: ${editor.status} ${editor.raw}`);
  }
  const examVersion = editor.body.examVersion;
  const composition = await apiJson(
    `/api/exams/${exam.body.id}/composition`,
    teacher.accessToken,
    {
      method: "PUT",
      body: JSON.stringify({
        expectedExamVersion: examVersion,
        durationMinutes: 30,
        sections: [
          {
            position: 0,
            title: "Section 1",
            questions: questionIds.map((qid, i) => ({
              sourceQuestionId: qid,
              position: i,
              defaultPoints: 1,
            })),
          },
        ],
      }),
    }
  );
  if (composition.status >= 300) {
    throw new Error(`composition failed: ${composition.status} ${composition.raw}`);
  }
  const published = await apiJson<{ questionCount: number }>(
    `/api/exams/${exam.body.id}/publish`,
    teacher.accessToken,
    { method: "POST", body: JSON.stringify({}) }
  );
  if (published.status !== 200) {
    throw new Error(`publish failed: ${published.status} ${published.raw}`);
  }

  const smoke: SmokeState = {
    teacher,
    student,
    stranger,
    classroomId: classroom.body.id,
    classroomName: classroom.body.name,
    bankId: bank.body.id,
    questionIds,
    examId: exam.body.id,
  };
  await fs.writeFile(`${__dirname}/.smoke-state.json`, JSON.stringify(smoke, null, 2));
}
