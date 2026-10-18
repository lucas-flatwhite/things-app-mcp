import { buildUpdateTodoURL, sanitizeThingsURL } from "../dist/things-url.js";
import { diffSnapshot } from "../dist/notion-sync/diff.js";
import { redactLog } from "../dist/notion-sync/log.js";
import {
  NotionClient,
  checkSchema,
  pageToSnapshot,
  snapshotToProperties,
} from "../dist/notion-sync/notion-api.js";
import { buildSyncPlan, preserveEvening } from "../dist/notion-sync/plan-build.js";
import { canonicalNotesEqual, hashFields } from "../dist/notion-sync/snapshot.js";
import { buildAddSyncUrl, buildUpdateSyncUrl, parseCallbackId } from "../dist/notion-sync/things-write.js";
import {
  classifyWhen,
  formatActivation,
  isTodayWritableWhen,
  whenToThingsParam,
} from "../dist/notion-sync/when.js";

let passCount = 0;
let failCount = 0;

function assert(condition, testName, detail = "") {
  if (condition) {
    passCount++;
    process.stdout.write(`  [PASS] ${testName}\n`);
  } else {
    failCount++;
    process.stdout.write(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}\n`);
  }
}

function assertEqual(actual, expected, testName) {
  const pass = actual === expected;
  assert(pass, testName, pass ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function section(name) {
  process.stdout.write(`\n=== ${name} ===\n`);
}

function snap(over = {}) {
  return {
    title: "우유",
    notes: "저지방",
    when: "오늘",
    deadline: "",
    tags: [],
    status: "open",
    projectId: "",
    projectName: "",
    areaId: "",
    areaName: "",
    ...over,
  };
}

function thing(over = {}) {
  return { ...snap(), id: "T1", modified: "2026-10-18T01:00:00.000Z", ...over };
}

function row(over = {}) {
  const snapshot = over.snapshot ?? snap();
  return {
    pageId: "N1",
    thingsId: "T1",
    hash: hashFields(snapshot),
    edited: "2026-10-18T01:00:00.000Z",
    snapshot,
    ...over,
  };
}

function plan(over = {}) {
  return buildSyncPlan({
    today: [],
    linkedOutsideToday: [],
    notion: [],
    missingThingsIds: new Set(),
    todayDate: "2026-10-18",
    resolvedProjectId: () => "none",
    resolvedAreaId: () => "none",
    knownTagNames: new Set(["장보기"]),
    ...over,
  });
}

function byAction(ops, action) {
  return ops.filter((op) => op.action === action);
}

section("When");
const SEOUL = "Asia/Seoul";
assertEqual(whenToThingsParam("오늘"), "today", "오늘 → today");
assertEqual(whenToThingsParam("오늘 저녁"), "evening", "오늘 저녁 → evening");
assertEqual(whenToThingsParam("언제든"), "anytime", "언제든 → anytime");
assertEqual(whenToThingsParam("언젠가"), "someday", "언젠가 → someday");
assertEqual(whenToThingsParam("받은함"), null, "받은함은 when을 생략");
assertEqual(isTodayWritableWhen("오늘", "2026-10-18"), true, "오늘은 다시 쓸 수 있음");
assertEqual(isTodayWritableWhen("오늘 저녁", "2026-10-18"), true, "오늘 저녁은 다시 쓸 수 있음");
assertEqual(isTodayWritableWhen("2026-10-17", "2026-10-18"), true, "지난 시작일도 오늘 목록에 있음");
assertEqual(isTodayWritableWhen("2026-10-19", "2026-10-18"), false, "미래 날짜는 Things에 쓰지 않음");
assertEqual(isTodayWritableWhen("언제든", "2026-10-18"), false, "언제든은 Things에 쓰지 않음");
assertEqual(isTodayWritableWhen("언젠가", "2026-10-18"), false, "언젠가는 Things에 쓰지 않음");
assertEqual(isTodayWritableWhen("받은함", "2026-10-18"), false, "받은함은 Things에 쓰지 않음");
assertEqual(whenToThingsParam("2026-10-18"), "2026-10-18", "날짜");
assertEqual(whenToThingsParam("2026-10-18 21:30"), "2026-10-18@21:30", "날짜와 시각");
assertEqual(formatActivation("2026-10-18T15:00:00.000Z", SEOUL), "2026-10-19", "UTC 자정은 서울에서 다음 날");
assertEqual(formatActivation("2026-10-18T12:30:00.000Z", SEOUL), "2026-10-18 21:30", "시각이 있으면 분까지");
assertEqual(
  classifyWhen({
    activationDate: null,
    projectId: null,
    areaId: null,
    inInbox: true,
    inSomeday: false,
    inAnytime: false,
    projectIsSomeday: false,
    timeZone: SEOUL,
    today: "2026-10-18",
  }).when,
  "받은함",
  "소속 없는 받은함"
);
assertEqual(
  classifyWhen({
    activationDate: "2026-10-17T15:00:00.000Z",
    projectId: "P1",
    areaId: "A1",
    inInbox: false,
    inSomeday: false,
    inAnytime: false,
    projectIsSomeday: false,
    timeZone: SEOUL,
    today: "2026-10-18",
  }).when,
  "2026-10-18",
  "시작일은 날짜로 유지"
);
assertEqual(
  classifyWhen({
    activationDate: null,
    projectId: "P1",
    areaId: "A1",
    inInbox: false,
    inSomeday: true,
    inAnytime: false,
    projectIsSomeday: true,
    timeZone: SEOUL,
    today: "2026-10-18",
  }).when,
  "언제든",
  "부모 프로젝트의 언젠가는 복사하지 않음"
);
assertEqual(
  preserveEvening("오늘 저녁", "오늘", "2026-10-18", "2026-10-18"),
  "오늘 저녁",
  "오늘 저녁 유지"
);
assertEqual(
  preserveEvening("오늘 저녁", "2026-10-18", "2026-10-18", "2026-10-18"),
  "오늘 저녁",
  "오늘 날짜도 저녁으로 유지"
);
assertEqual(
  preserveEvening("오늘 저녁", "오늘", "2026-10-17", "2026-10-18"),
  "오늘",
  "다른 날이면 저녁을 유지하지 않음"
);

section("Snapshot and diff");
const base = snap({ when: "언제든", tags: ["장보기"], areaId: "A1", areaName: "집" });
const hashed = hashFields(base);
assert(hashed.startsWith("title="), "해시 접두사");
assertEqual(hashFields(base), hashFields({ ...base, tags: ["장보기"] }), "같은 스냅샷");
assert(hashFields(base) !== hashFields({ ...base, deadline: "2026-10-20" }), "마감만 달라도 해시가 다름");
assert(hashFields({ ...base, projectId: "P1", areaId: "A9" }).includes("areaId="), "area 해시는 항상 포함");
assertEqual(
  hashFields({ ...base, projectId: "P1", areaId: "A9" }),
  hashFields({ ...base, projectId: "P1", areaId: "" }),
  "프로젝트 안에서는 영역 id를 해시하지 않음"
);
const long = "가".repeat(2001);
assertEqual(canonicalNotesEqual(long, "가".repeat(2000)), true, "잘린 메모는 같음");
assertEqual(canonicalNotesEqual(long, "다름"), false, "다른 메모");

const stored = hashFields(base);
const diff = diffSnapshot({
  storedHash: stored,
  things: { ...base, notes: "전지방" },
  notion: { ...base, deadline: "2026-10-21" },
  thingsModified: "2026-10-18T01:00:00.000Z",
  notionEdited: "2026-10-18T02:00:00.000Z",
});
assertEqual(diff.notes, "things", "메모는 Things만 변경");
assertEqual(diff.deadline, "notion", "마감은 Notion만 변경");
assertEqual(diff.title, "same", "제목은 유지");
assertEqual(
  diffSnapshot({
    storedHash: stored,
    things: { ...base, title: "Things 제목" },
    notion: { ...base, title: "Notion 제목" },
    thingsModified: "2026-10-18T03:00:00.000Z",
    notionEdited: "2026-10-18T02:00:00.000Z",
  }).title,
  "things",
  "같은 칸이면 더 최근인 Things"
);
assertEqual(
  diffSnapshot({
    storedHash: stored,
    things: { ...base, title: "Things 제목" },
    notion: { ...base, title: "Notion 제목" },
    thingsModified: "2026-10-18T02:00:00.000Z",
    notionEdited: "2026-10-18T02:00:00.000Z",
  }).title,
  "things",
  "같으면 Things"
);
const first = diffSnapshot({
  storedHash: "",
  things: base,
  notion: { ...base, notes: "", deadline: "2026-11-01" },
  thingsModified: "2026-10-18T02:00:00.000Z",
  notionEdited: "2026-10-18T02:00:00.000Z",
});
assertEqual(first.notes, "things", "첫 동기화에서 빈 Notion 메모가 Things를 지우지 않음");
assertEqual(first.deadline, "notion", "첫 동기화에서 Notion에만 있는 마감은 반영");
assertEqual(first.title, "same", "첫 동기화에서 같은 값은 유지");

section("Clear deadline");
const cleared = buildUpdateTodoURL({
  "auth-token": "secret-token",
  id: "ABC",
  clear: ["deadline"],
});
assert(cleared.includes("deadline="), "빈 deadline= 가 남음");
assert(!cleared.includes("deadline=secret"), "빈 값");
assert(!sanitizeThingsURL(cleared).includes("secret-token"), "로그용 URL에서 토큰 제거");
const omitted = buildUpdateTodoURL({ "auth-token": "secret-token", id: "ABC", deadline: "" });
assert(!omitted.includes("deadline"), "빈 deadline은 기존처럼 생략");

section("Plan");
{
  const todayOnly = plan({ today: [thing()] });
  assertEqual(byAction(todayOnly.ops, "create-notion").length, 1, "Today에만 있으면 Notion 행 생성");
  const outside = plan({ linkedOutsideToday: [thing({ id: "OUT" })] });
  assertEqual(outside.ops.length, 0, "Today 밖이며 연결이 없으면 행을 만들지 않음");

  const created = plan({
    notion: [row({ thingsId: "", hash: "", snapshot: snap({ when: "" }) })],
  });
  assertEqual(byAction(created.ops, "create-things")[0].whenParam, "today", "빈 언제는 오늘로 만듦");
  const evening = plan({
    notion: [row({ thingsId: "", hash: "", snapshot: snap({ when: "오늘 저녁" }) })],
  });
  assertEqual(byAction(evening.ops, "create-things")[0].whenParam, "evening", "오늘 저녁으로 만듦");
  for (const when of ["언젠가", "언제든", "받은함", "2026-10-19"]) {
    const skipped = plan({
      notion: [row({ thingsId: "", hash: "", snapshot: snap({ when }) })],
    });
    assertEqual(skipped.ops[0].action, "skip", `${when} 은 만들지 않음`);
    assertEqual(skipped.ops[0].detail, "not-today", `${when} 상세`);
  }
  assertEqual(
    plan({ notion: [row({ thingsId: "", hash: "", snapshot: snap({ title: "  " }) })] }).ops[0].detail,
    "empty-title",
    "빈 제목"
  );
  assertEqual(
    plan({ notion: [row({ thingsId: "", hash: "needs-id", snapshot: snap() })] }).ops[0].detail,
    "needs-id",
    "needs-id 는 다시 만들지 않음"
  );
  const dup = plan({
    notion: [
      row({ pageId: "A" }),
      row({ pageId: "B" }),
    ],
  });
  assertEqual(byAction(dup.ops, "skip").length, 2, "같은 id 두 행은 건너뜀");
  assert(dup.ops.every((op) => op.detail === "duplicate-id"), "duplicate-id");

  const thingsNotes = thing({ notes: "전지방" });
  const notesOnly = plan({
    today: [thingsNotes],
    notion: [row({ hash: hashFields(snap()), snapshot: snap() })],
  });
  assertEqual(byAction(notesOnly.ops, "update-notion")[0].fields.join(","), "notes", "메모는 Notion으로");
  assertEqual(byAction(notesOnly.ops, "update-things").length, 0, "메모 변경은 Things에 쓰지 않음");

  const deadline = plan({
    today: [thing({ deadline: "2026-10-20" })],
    notion: [row({ hash: hashFields(snap({ deadline: "2026-10-20" })), snapshot: snap({ deadline: "" }) })],
  });
  const deadlineOp = byAction(deadline.ops, "update-things")[0];
  assertEqual(deadlineOp.fields.join(","), "deadline", "마감은 Things로");
  assertEqual(deadlineOp.clearDeadline, true, "빈 마감은 지움");

  const canceled = plan({
    today: [thing()],
    notion: [row({ hash: hashFields(snap()), snapshot: snap({ status: "canceled" }) })],
  });
  assertEqual(byAction(canceled.ops, "update-things")[0].fields.join(","), "status", "취소는 Things로");

  const planning = plan({
    today: [thing({ notes: "저지방" })],
    notion: [row({
      hash: hashFields(snap()),
      snapshot: snap({ when: "언젠가", notes: "고친 메모" }),
    })],
  });
  const planningWrite = byAction(planning.ops, "update-things")[0];
  assert(planningWrite.fields.includes("notes"), "메모 변경은 남음");
  assert(!planningWrite.fields.includes("when"), "언젠가는 Things에 쓰지 않음");
  assert(planningWrite.detail.includes("when-stays-in-things"), "when-stays-in-things");

  const container = plan({
    today: [thing({ projectId: "P1", projectName: "집 프로젝트" })],
    notion: [row({
      hash: hashFields(snap()),
      snapshot: snap({ projectId: "P2", projectName: "다른 이름" }),
    })],
  });
  assert(container.ops.filter((op) => op.action === "update-things").every((op) => !op.fields.includes("projectId")), "프로젝트는 Things로 쓰지 않음");
  const containerNotion = byAction(container.ops, "update-notion")[0];
  assert(containerNotion.fields.includes("projectName"), "프로젝트 표시 이름");
  assert(!containerNotion.fields.includes("projectId"), "필드 목록의 프로젝트 id는 이름이 대신함");
  assert(containerNotion.detail.includes("container-stays-in-things"), "container-stays-in-things");

  const left = plan({
    linkedOutsideToday: [thing({ notes: "밖" })],
    notion: [row({ hash: hashFields(snap()), snapshot: snap() })],
  });
  assertEqual(byAction(left.ops, "update-things").length, 0, "오늘 밖은 Things에 쓰지 않음");
  assertEqual(byAction(left.ops, "update-notion")[0].detail, "left-today", "left-today");

  const gone = plan({
    missingThingsIds: new Set(["T1"]),
    notion: [row()],
  });
  assertEqual(byAction(gone.ops, "cancel-notion").length, 1, "없는 id만 취소");
  assertEqual(gone.ops.length, 1, "취소 외에 다른 연산 없음");

  const ambiguous = plan({
    resolvedProjectId: () => "many",
    notion: [row({
      thingsId: "",
      hash: "",
      snapshot: snap({ when: "오늘", projectName: "겹침" }),
    })],
  });
  const ambiguousOp = byAction(ambiguous.ops, "create-things")[0];
  assertEqual(ambiguousOp.listId, "", "이름이 여러 개면 list-id 없음");
  assert(ambiguousOp.detail.includes("project-ambiguous"), "project-ambiguous");

  const tags = plan({
    today: [thing({ tags: [] })],
    notion: [row({
      hash: hashFields(snap()),
      snapshot: snap({ tags: ["장보기", "없는태그"] }),
    })],
  });
  const tagOp = byAction(tags.ops, "update-things")[0];
  assert(!tagOp.snapshot.tags.includes("없는태그"), "없는 태그는 빼기");
  assert(tagOp.detail.includes("tag-missing:없는태그"), "tag-missing");

  const eveningKept = plan({
    today: [thing({ when: "오늘 저녁" })],
    notion: [row({ snapshot: snap({ when: "오늘 저녁" }), hash: hashFields(snap({ when: "오늘 저녁" })) })],
  });
  assertEqual(eveningKept.ops.length, 0, "오늘 저녁이 같으면 연산 없음");
}

section("Things URL");
const addToday = buildAddSyncUrl({ snapshot: snap(), whenParam: "today" });
assert(addToday.url.includes("when=today"), "오늘 생성");
assert(!addToday.url.includes("reveal"), "reveal 없음");
const addEvening = buildAddSyncUrl({ snapshot: snap({ when: "오늘 저녁" }), whenParam: "evening" });
assert(addEvening.url.includes("when=evening"), "저녁 생성");
const addProject = buildAddSyncUrl({ snapshot: snap(), whenParam: "today", listId: "PID" });
assert(addProject.url.includes("list-id=PID"), "list-id");
assert(!addProject.url.includes("list="), "list 이름 없음");
const updateDeadline = buildUpdateSyncUrl({
  authToken: "tok",
  id: "T1",
  snapshot: snap({ deadline: "" }),
  fields: ["deadline"],
  clearDeadline: true,
});
assert(updateDeadline.url.includes("deadline="), "update deadline=");
const done = buildUpdateSyncUrl({
  authToken: "tok",
  id: "T1",
  snapshot: snap({ status: "completed" }),
  fields: ["status"],
});
assert(done.url.includes("completed=true"), "완료");
const cancel = buildUpdateSyncUrl({
  authToken: "tok",
  id: "T1",
  snapshot: snap({ status: "canceled" }),
  fields: ["status"],
});
assert(cancel.url.includes("canceled=true"), "취소");
const reopen = buildUpdateSyncUrl({
  authToken: "tok",
  id: "T1",
  snapshot: snap({ status: "open" }),
  fields: ["status"],
});
assert(reopen.url.includes("completed=false"), "열림 completed");
assert(reopen.url.includes("canceled=false"), "열림 canceled");
const tagged = buildUpdateSyncUrl({
  authToken: "tok",
  id: "T1",
  snapshot: snap({ tags: ["장보기", "없는태그"] }),
  fields: ["tags"],
  knownTagNames: new Set(["장보기"]),
});
assert(tagged.url.includes("tags=%EC%9E%A5%EB%B3%B4%EA%B8%B0") || tagged.url.includes("tags=장보기"), "알려진 태그만");
assert(tagged.warnings.includes("tag-missing:없는태그"), "태그 경고");
assertEqual(parseCallbackId("http://127.0.0.1/success?x-things-id=A,B").ids.join(","), "A,B", "콜백 id");

section("Notion");
{
  let time = 0;
  const sleeps = [];
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, time });
    if (calls.length === 4) {
      return {
        ok: false,
        status: 429,
        headers: { get: (name) => (name === "Retry-After" ? "2" : null) },
        json: async () => ({}),
        text: async () => "",
      };
    }
    if (url.endsWith("/query") && calls.filter((call) => call.url.endsWith("/query")).length === 1) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ results: [{ id: "a" }], has_more: true, next_cursor: "c2" }),
        text: async () => "",
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ results: [{ id: "b" }], has_more: false }),
      text: async () => "",
    };
  };
  const client = new NotionClient("test-token", fetchImpl, async (ms) => {
    sleeps.push(ms);
    time += ms;
  }, () => time);
  const pages = await client.queryAll();
  assertEqual(pages.map((page) => page.id).join(","), "a,b", "두 페이지를 합침");
  assert(calls.some((call) => call.init.body && call.init.body.includes("c2")), "start_cursor");
  assertEqual(calls[0].init.headers.Authorization, "Bearer test-token", "Authorization");
  assertEqual(calls[0].init.headers["Notion-Version"], "2022-06-28", "Notion-Version");
  assert(sleeps.length >= 1, "4번째 조회 전에 대기");

  let retried = 0;
  const retryClient = new NotionClient("test-token", async () => {
    retried += 1;
    if (retried === 1) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => "2" },
        json: async () => ({}),
        text: async () => "",
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ results: [], has_more: false }),
      text: async () => "",
    };
  }, async (ms) => {
    sleeps.push(ms);
    time += ms;
  }, () => time);
  await retryClient.queryAll();
  assert(sleeps.includes(2000), "Retry-After 2초");

  let pageCalls = 0;
  let failTime = 20_000;
  const failing = new NotionClient("t", async (url) => {
    pageCalls += 1;
    if (pageCalls === 1) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ results: [{ id: "a" }], has_more: true, next_cursor: "n" }),
        text: async () => "",
      };
    }
    return {
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => "nope",
    };
  }, async (ms) => {
    failTime += ms;
  }, () => failTime);
  let threw = false;
  try {
    await failing.queryAll();
  } catch {
    threw = true;
  }
  assert(threw, "다음 페이지 실패는 throw");

  const page = pageToSnapshot({
    id: "page",
    last_edited_time: "2026-10-18T00:00:00.000Z",
    properties: {
      제목: { type: "title", title: [{ plain_text: "우유" }] },
      메모: { type: "rich_text", rich_text: [{ plain_text: "저지방" }] },
      언제: { type: "rich_text", rich_text: [{ plain_text: "오늘" }] },
      상태: { type: "select", select: { name: "완료" } },
      마감일: { type: "date", date: { start: "2026-10-20" } },
      태그: { type: "multi_select", multi_select: [{ name: "장보기" }] },
      프로젝트: { type: "rich_text", rich_text: [{ plain_text: "집" }] },
      "프로젝트 id": { type: "rich_text", rich_text: [{ plain_text: "P1" }] },
      영역: { type: "rich_text", rich_text: [] },
      "영역 id": { type: "rich_text", rich_text: [] },
      things_id: { type: "rich_text", rich_text: [{ plain_text: "T1" }] },
      "동기화 해시": { type: "rich_text", rich_text: [{ plain_text: "abc" }] },
    },
  });
  assertEqual(page.snapshot.title, "우유", "제목");
  assertEqual(page.snapshot.status, "completed", "완료");
  assertEqual(page.snapshot.areaName, "", "없는 영역");
  assertEqual(page.thingsId, "T1", "things_id");
  const props = snapshotToProperties(snap({ status: "canceled", deadline: "2026-10-21" }), ["status", "deadline"]);
  assertEqual(props["상태"].select.name, "취소", "상태 쓰기");
  assertEqual(props["마감일"].date.start, "2026-10-21", "마감 쓰기");
  assertEqual(props["시작일"], undefined, "시작일은 쓰지 않음");
  const schema = checkSchema({ properties: { 제목: { type: "rich_text" } } });
  assertEqual(schema.ok, false, "스키마 불일치");
  assert(schema.wrongType.some((item) => item.startsWith("제목:")), "잘못된 제목 타입");
}

section("Log");
const dirty = "Authorization: Bearer secret_abc ntn_xyz auth-token=tok notes=비밀";
const clean = redactLog(dirty);
assert(!clean.includes("secret_abc"), "secret 제거");
assert(!clean.includes("ntn_xyz"), "ntn 제거");
assert(!clean.includes("auth-token=tok"), "auth-token 제거");
assert(clean.includes("auth-token=***"), "auth-token 마스킹");
assert(!clean.includes("비밀"), "notes 제거");

process.stdout.write(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount === 0 ? 0 : 1);
