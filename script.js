const STORAGE_KEY = "planner-events";
const COLORS = ["#FFFFFF", "#FFF4B8", "#DDF1FF", "#FFDADA"];
const DEFAULT_COLOR = "#FFFFFF";
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const sheetQuery = window.matchMedia("(max-width: 640px)"); // 모바일: 아래에서 올라오는 시트
const coarseQuery = window.matchMedia("(pointer: coarse)"); // 터치 기기

const calendar = document.getElementById("calendar");
const grid = document.getElementById("grid");
const titleEl = document.getElementById("title");
const overlay = document.getElementById("overlay");
const panel = document.getElementById("panel");
const sheetHead = document.getElementById("sheet-head");
const dayTitle = document.getElementById("day-title");
const dayList = document.getElementById("day-list");
const editor = document.getElementById("editor");
const formTitle = document.getElementById("form-title");
const titleInput = document.getElementById("title-input");
const memoInput = document.getElementById("memo-input");
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const swatches = document.querySelectorAll(".swatch");
const deleteBtn = document.getElementById("delete-btn");
const submitBtn = document.getElementById("submit-btn");
const trash = document.getElementById("trash");
const toastEl = document.getElementById("toast");
const importFile = document.getElementById("import-file");
const choice = document.getElementById("choice");
const choiceText = document.getElementById("choice-text");

const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let events = load();
let editing = null; // { dateKey, id | null }
let sheetDay = null; // 시트/입력창을 연 날짜
let selectedColor = DEFAULT_COLOR;
let justDragged = false;

/* ---------- 데이터 ---------- */

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 예전 데이터(text, color만 있음)도 읽을 수 있게 정리한다. text → 제목, memo 없으면 빈 값.
// 여러 날에 걸친 일정은 시작일 키에 저장하고, 마지막 일은 end(YYYY-MM-DD)에 둔다. 하루짜리는 end가 빈 값.
function normalizeEvent(raw, key) {
  if (!raw || typeof raw !== "object") return null;
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (!text) return null;
  const color = String(raw.color || "").toUpperCase();
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    text,
    memo: typeof raw.memo === "string" ? raw.memo : "",
    color: COLORS.includes(color) ? color : DEFAULT_COLOR,
    done: raw.done === true,
    end: typeof raw.end === "string" && DATE_KEY_RE.test(raw.end) && raw.end > key ? raw.end : "",
  };
}

// strict=true면 형식이 하나라도 틀릴 때 null을 돌려준다 (불러오기 검사용)
function normalizeEvents(obj, strict) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  for (const [key, list] of Object.entries(obj)) {
    if (!DATE_KEY_RE.test(key) || !Array.isArray(list)) {
      if (strict) return null;
      continue;
    }
    const items = [];
    for (const raw of list) {
      const ev = normalizeEvent(raw, key);
      if (ev) items.push(ev);
      else if (strict) return null;
    }
    if (items.length) out[key] = items;
  }
  return out;
}

function load() {
  try {
    return normalizeEvents(JSON.parse(localStorage.getItem(STORAGE_KEY)), false) || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    alert("브라우저 저장소에 접근할 수 없어 일정이 유지되지 않을 수 있습니다.");
  }
}

function countEvents(obj) {
  return Object.values(obj).reduce((n, list) => n + list.length, 0);
}

function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function findEvent(key, id) {
  return (events[key] || []).find((e) => e.id === id);
}

// 그 날짜에 보이는 일정 (시작일부터 마지막 일까지 걸친 일정 포함). start는 일정이 저장된 시작일 키.
function eventsOn(key) {
  const out = [];
  for (const [start, list] of Object.entries(events)) {
    if (start > key) continue;
    for (const ev of list) {
      if (start === key || (ev.end && ev.end >= key)) out.push({ ev, start });
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/* ---------- 달력 그리기 ---------- */

// 왼쪽 세로 월 목록: 이번 달부터 15개월, 보고 있는 달이 범위 밖이면 범위를 넓힌다
const rail = document.getElementById("rail");
let railStart = now.getFullYear() * 12 + now.getMonth();
let railEnd = railStart + 14;

function buildRail() {
  const view = viewYear * 12 + viewMonth;
  railStart = Math.min(railStart, view);
  railEnd = Math.max(railEnd, view);
  const keepScroll = rail.scrollTop;
  rail.replaceChildren();

  let lastYear = null;
  for (let v = railStart; v <= railEnd; v++) {
    const y = Math.floor(v / 12), m = v % 12;
    if (y !== lastYear) {
      const label = document.createElement("div");
      label.className = "rail-year";
      label.textContent = y;
      rail.append(label);
      lastYear = y;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rail-month" + (v === view ? " active" : "");
    btn.textContent = m + 1;
    btn.setAttribute("aria-label", `${y}년 ${m + 1}월로 이동`);
    if (v === view) btn.setAttribute("aria-current", "true");
    btn.addEventListener("click", () => {
      const delta = Math.sign(v - (viewYear * 12 + viewMonth));
      viewYear = y;
      viewMonth = m;
      render(delta);
    });
    rail.append(btn);
  }
  rail.scrollTop = keepScroll;
  const active = rail.querySelector(".active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function render(dir) {
  titleEl.textContent = `${viewYear}년 ${viewMonth + 1}월`;
  buildRail();
  grid.replaceChildren();

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 0; i < totalCells; i++) {
    // Date가 월 범위를 벗어난 값을 자동으로 보정해 준다
    const d = new Date(viewYear, viewMonth, i - firstDay + 1);
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = d.getDay();
    const holiday = HOLIDAYS[key];
    const list = eventsOn(key);

    const cell = document.createElement("div");
    cell.className = "cell";
    if (d.getMonth() !== viewMonth) cell.classList.add("other");
    if (dow === 0) cell.classList.add("sun");
    if (dow === 6) cell.classList.add("sat");
    if (holiday) cell.classList.add("holiday");
    if (key === todayKey) cell.classList.add("today");
    cell.setAttribute("role", "group");
    cell.setAttribute(
      "aria-label",
      `${d.getMonth() + 1}월 ${d.getDate()}일${holiday ? " " + holiday : ""}`
    );

    const head = document.createElement("div");
    head.className = "cell-head";
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = d.getDate();
    head.append(num);

    if (holiday) {
      const name = document.createElement("span");
      name.className = "holiday-name";
      name.textContent = holiday;
      head.append(name);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-btn";
    add.textContent = "+";
    add.setAttribute("aria-label", `${d.getMonth() + 1}월 ${d.getDate()}일 일정 추가`);
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditor(key, null);
    });
    head.append(add);

    // 데스크톱: 제목이 보이는 메모 카드
    const notes = document.createElement("div");
    notes.className = "notes";
    for (const { ev, start } of list) notes.append(buildNote(start, ev, key));

    // 모바일: 색 점(최대 3개, 초과 시 +n)
    const dots = document.createElement("div");
    dots.className = "dots";
    list.slice(0, 3).forEach(({ ev }) => {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = ev.color;
      dots.append(dot);
    });
    if (list.length > 3) {
      const more = document.createElement("span");
      more.className = "more";
      more.textContent = `+${list.length - 3}`;
      dots.append(more);
    }

    // 모바일에서는 칸 전체를 눌러 시트를 연다
    cell.addEventListener("click", () => {
      if (sheetQuery.matches) openEditor(key, null);
    });

    cell.append(head, notes, dots);
    grid.append(cell);
  }

  if (dir) {
    grid.classList.remove("slide-next", "slide-prev");
    void grid.offsetWidth; // 애니메이션 다시 시작
    grid.classList.add(dir > 0 ? "slide-next" : "slide-prev");
  }
}

function buildCheck(key, ev) {
  const check = document.createElement("button");
  check.type = "button";
  check.className = "check";
  check.textContent = ev.done ? "✓" : "";
  check.setAttribute("aria-pressed", String(ev.done));
  check.setAttribute("aria-label", `${ev.text} 완료 표시`);
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDone(key, ev.id);
  });
  return check;
}

// key: 일정이 저장된 시작일, day: 지금 그려지는 날짜
function buildNote(key, ev, day) {
  const note = document.createElement("div");
  note.className = "note" + (ev.done ? " done" : "");
  note.style.background = ev.color + "CC"; // 반투명 파스텔
  note.tabIndex = 0;
  note.setAttribute("role", "button");

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = ev.text;
  note.append(buildCheck(key, ev), title);

  if (ev.memo) {
    const mark = document.createElement("span");
    mark.className = "memo-dot";
    mark.title = "추가 내용 있음";
    mark.setAttribute("aria-label", "추가 내용 있음");
    note.append(mark);
  }

  if (ev.end) {
    note.classList.add("multi");
    note.title = `${key.slice(5).replace("-", "/")} ~ ${ev.end.slice(5).replace("-", "/")}`;
  }

  note.addEventListener("click", () => {
    if (justDragged) return;
    openEditor(key, ev.id, day);
  });
  note.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target === note) openEditor(key, ev.id, day);
  });
  note.addEventListener("pointerdown", (e) => startDrag(e, note, key, ev.id));
  return note;
}

function toggleDone(key, id) {
  const ev = findEvent(key, id);
  if (!ev) return;
  ev.done = !ev.done;
  save();
  render();
  if (!overlay.hidden) renderDayList();
}

/* ---------- 드래그해서 삭제 (마우스 전용) ---------- */

function deleteEvent(key, id) {
  events[key] = (events[key] || []).filter((x) => x.id !== id);
  if (!events[key].length) delete events[key];
  save();
  render();
}

function startDrag(e, note, key, id) {
  // 터치·펜에서는 드래그 삭제를 쓰지 않는다 (우연한 삭제 방지)
  if (e.pointerType !== "mouse" || e.button !== 0) return;
  if (e.target.closest(".check")) return;
  const startX = e.clientX, startY = e.clientY;
  let ghost = null;

  const overTrash = (ev) => {
    const r = trash.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right &&
           ev.clientY >= r.top && ev.clientY <= r.bottom;
  };

  const onMove = (ev) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      const r = note.getBoundingClientRect();
      ghost = note.cloneNode(true);
      ghost.classList.add("ghost");
      ghost.style.width = r.width + "px";
      document.body.append(ghost);
      note.classList.add("dragging");
      trash.hidden = false;
    }
    ghost.style.left = ev.clientX + 8 + "px";
    ghost.style.top = ev.clientY + 8 + "px";
    trash.classList.toggle("active", overTrash(ev));
  };

  const onUp = (ev) => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    if (!ghost) return;
    const drop = overTrash(ev) && ev.type === "pointerup";
    ghost.remove();
    note.classList.remove("dragging");
    trash.hidden = true;
    trash.classList.remove("active");
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
    if (drop) deleteEvent(key, id);
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

/* ---------- 입력창 / 시트 ---------- */

function setColor(color) {
  selectedColor = color;
  swatches.forEach((s) =>
    s.setAttribute("aria-checked", String(s.dataset.color === color))
  );
}

function fillForm(key, id) {
  editing = { dateKey: key, id };
  const [, m, d] = key.split("-").map(Number);
  const ev = id ? findEvent(key, id) : null;
  const sheet = sheetQuery.matches;

  formTitle.textContent = sheet
    ? (ev ? "일정 수정" : "새 일정 추가")
    : `${m}월 ${d}일 ${ev ? "일정 수정" : "일정 추가"}`;
  submitBtn.textContent = ev ? "저장" : "추가";
  deleteBtn.hidden = !ev;
  titleInput.value = ev ? ev.text : "";
  memoInput.value = ev ? ev.memo : "";
  startInput.value = key;
  endInput.value = ev && ev.end ? ev.end : key;
  endInput.min = key;
  setColor(ev ? ev.color : DEFAULT_COLOR);
}

// 시작일을 바꾸면 마지막 일이 시작일보다 빠르지 않게 맞춘다
startInput.addEventListener("change", () => {
  if (!startInput.value) return;
  endInput.min = startInput.value;
  if (!endInput.value || endInput.value < startInput.value) endInput.value = startInput.value;
});

function renderDayList() {
  const { id: editingId } = editing;
  const list = eventsOn(sheetDay);
  dayList.replaceChildren();

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "아직 일정이 없어요";
    dayList.append(empty);
    return;
  }

  for (const { ev, start: key } of list) {
    const row = document.createElement("div");
    row.className = "row" + (ev.done ? " done" : "") + (ev.id === editingId ? " active" : "");
    row.style.background = ev.color + "CC";

    const main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";
    const t = document.createElement("span");
    t.className = "row-title";
    t.textContent = ev.text;
    main.append(t);
    if (ev.end) {
      const r = document.createElement("span");
      r.className = "row-memo";
      r.textContent = `${Number(key.slice(5, 7))}월 ${Number(key.slice(8))}일 ~ ${Number(ev.end.slice(5, 7))}월 ${Number(ev.end.slice(8))}일`;
      main.append(r);
    }
    if (ev.memo) {
      const m = document.createElement("span");
      m.className = "row-memo";
      m.textContent = ev.memo;
      main.append(m);
    }
    main.addEventListener("click", () => {
      fillForm(key, ev.id);
      renderDayList();
      titleInput.focus();
    });

    row.append(buildCheck(key, ev), main);    dayList.append(row);
  }
}

// key: 일정이 저장된 시작일(새 일정이면 누른 날짜), day: 시트에 보여줄 날짜
function openEditor(key, id, day = key) {
  sheetDay = day;
  const [, m, d] = day.split("-").map(Number);
  const dow = new Date(Number(day.slice(0, 4)), m - 1, d).getDay();
  const holiday = HOLIDAYS[day];
  dayTitle.textContent = `${m}월 ${d}일 (${DAY_NAMES[dow]})${holiday ? " · " + holiday : ""}`;

  overlay.classList.toggle("sheet-mode", sheetQuery.matches);
  fillForm(key, id);
  renderDayList();

  // 시트를 내려서 닫았던 흔적 초기화
  panel.style.transform = "";
  panel.style.transition = "";
  panel.style.animation = "";

  overlay.hidden = false;
  if (!sheetQuery.matches) titleInput.focus(); // 모바일에서는 키보드가 갑자기 뜨지 않게 한다
}

function closeEditor() {
  overlay.hidden = true;
  editing = null;
}

editor.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = titleInput.value.trim();
  if (!text) {
    titleInput.focus();
    return;
  }
  const memo = memoInput.value.trim();
  const start = startInput.value;
  const last = endInput.value || start;
  if (!DATE_KEY_RE.test(start)) {
    startInput.focus();
    return;
  }
  if (last < start) {
    toast("마지막 일은 시작일보다 빠를 수 없어요");
    endInput.focus();
    return;
  }
  const end = last > start ? last : "";
  const { dateKey: key, id } = editing;
  const ev = id ? findEvent(key, id) : null;
  if (ev) {
    ev.text = text;
    ev.memo = memo;
    ev.color = selectedColor;
    ev.end = end;
    if (start !== key) {
      // 시작일이 바뀌면 새 날짜 아래로 옮긴다
      events[key] = events[key].filter((x) => x !== ev);
      if (!events[key].length) delete events[key];
      (events[start] ||= []).push(ev);
    }
  } else {
    (events[start] ||= []).push({ id: newId(), text, memo, color: selectedColor, done: false, end });
  }
  save();
  render();
  if (sheetQuery.matches) {
    fillForm(sheetDay, null);
    renderDayList();
  } else {
    closeEditor();
  }
});

deleteBtn.addEventListener("click", () => {
  const { dateKey: key, id } = editing;
  // 터치 기기나 모바일 시트에서는 삭제 전에 한 번 더 확인한다
  if ((coarseQuery.matches || sheetQuery.matches) && !window.confirm("이 일정을 삭제할까요?")) return;
  deleteEvent(key, id);
  if (sheetQuery.matches) {
    fillForm(sheetDay, null);
    renderDayList();
  } else {
    closeEditor();
  }
});

swatches.forEach((s) => s.addEventListener("click", () => setColor(s.dataset.color)));
document.getElementById("cancel-btn").addEventListener("click", closeEditor);
document.getElementById("close-btn").addEventListener("click", closeEditor);
overlay.addEventListener("pointerdown", (e) => {
  if (e.target === overlay) closeEditor();
});

// 시트를 아래로 끌어내리면 닫힌다
let sheetStartY = null;
sheetHead.addEventListener("pointerdown", (e) => {
  if (!sheetQuery.matches || e.target.closest(".close-btn")) return;
  sheetStartY = e.clientY;
  sheetHead.setPointerCapture(e.pointerId);
});
sheetHead.addEventListener("pointermove", (e) => {
  if (sheetStartY === null) return;
  const dy = Math.max(0, e.clientY - sheetStartY);
  panel.style.animation = "none";
  panel.style.transition = "none";
  panel.style.transform = `translateY(${dy}px)`;
});
const endSheetDrag = (e) => {
  if (sheetStartY === null) return;
  const dy = e.clientY - sheetStartY;
  sheetStartY = null;
  if (dy > 80) {
    closeEditor();
  } else {
    panel.style.transition = "transform .2s";
    panel.style.transform = "";
  }
};
sheetHead.addEventListener("pointerup", endSheetDrag);
sheetHead.addEventListener("pointercancel", endSheetDrag);

// 화면 크기가 바뀌어 모드가 달라지면 열린 창은 닫는다
sheetQuery.addEventListener("change", () => {
  if (!overlay.hidden) closeEditor();
});

/* ---------- 월 이동 ---------- */

function moveMonth(delta) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  render(delta);
}
document.getElementById("prev-btn").addEventListener("click", () => moveMonth(-1));
document.getElementById("next-btn").addEventListener("click", () => moveMonth(1));
document.getElementById("today-btn").addEventListener("click", () => {
  const delta = (now.getFullYear() - viewYear) * 12 + (now.getMonth() - viewMonth);
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  render(delta === 0 ? 0 : Math.sign(delta));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!choice.hidden) document.getElementById("choice-cancel").click();
    else if (!overlay.hidden) closeEditor();
    return;
  }
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
  if (!overlay.hidden || !choice.hidden) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  moveMonth(e.key === "ArrowLeft" ? -1 : 1);
});

// 모바일: 좌우로 충분히 밀었을 때만 달을 넘긴다 (세로 스크롤·터치와 구분)
let swipeX = null, swipeY = null;
calendar.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1 || !overlay.hidden) {
    swipeX = null;
    return;
  }
  swipeX = e.touches[0].clientX;
  swipeY = e.touches[0].clientY;
}, { passive: true });
calendar.addEventListener("touchend", (e) => {
  if (swipeX === null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipeX;
  const dy = t.clientY - swipeY;
  swipeX = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) moveMonth(dx < 0 ? 1 : -1);
}, { passive: true });

/* ---------- 주간 할 일 (날짜와 무관, 일~토 한 주 단위) ---------- */

const TODO_KEY = "planner-todos";
const todoList = document.getElementById("todo-list");
const todoFolds = document.getElementById("todo-folds");
const todoRange = document.getElementById("todo-range");
let todos = loadTodos(); // { "그 주 일요일 YYYY-MM-DD": [{ id, text, done }] }
let todoAdding = null; // 입력칸이 열려 있는 주(일요일 키)
const foldOpen = { prev: false, next: false };

function normalizeTodos(obj, strict) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  for (const [key, list] of Object.entries(obj)) {
    if (!DATE_KEY_RE.test(key) || !Array.isArray(list)) {
      if (strict) return null;
      continue;
    }
    const items = [];
    for (const raw of list) {
      const text = raw && typeof raw.text === "string" ? raw.text.trim() : "";
      if (!text) {
        if (strict) return null;
        continue;
      }
      items.push({ id: typeof raw.id === "string" && raw.id ? raw.id : newId(), text, done: raw.done === true });
    }
    if (items.length) out[key] = items;
  }
  return out;
}

function loadTodos() {
  try {
    return normalizeTodos(JSON.parse(localStorage.getItem(TODO_KEY)), false) || {};
  } catch {
    return {};
  }
}

function saveTodos() {
  try {
    localStorage.setItem(TODO_KEY, JSON.stringify(todos));
  } catch {
    alert("브라우저 저장소에 접근할 수 없어 할 일이 유지되지 않을 수 있습니다.");
  }
}

// 기준 날짜가 속한 주의 일요일 키 (offset: 주 단위 이동)
function weekKey(offset = 0) {
  const t = new Date();
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay() + offset * 7);
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function weekLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  const end = new Date(y, m - 1, d + 6);
  return `${m}/${d} (일) ~ ${end.getMonth() + 1}/${end.getDate()} (토)`;
}

function toggleTodo(wk, id) {
  const t = (todos[wk] || []).find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveTodos();
  renderTodos();
}

function deleteTodo(wk, id) {
  todos[wk] = (todos[wk] || []).filter((x) => x.id !== id);
  if (!todos[wk].length) delete todos[wk];
  saveTodos();
  renderTodos();
}

function addTodo(wk, text) {
  (todos[wk] ||= []).push({ id: newId(), text, done: false });
  saveTodos();
}

function buildTodoItem(wk, t) {
  const li = document.createElement("li");
  li.className = "todo-item" + (t.done ? " done" : "");

  const check = document.createElement("button");
  check.type = "button";
  check.className = "check";
  check.textContent = t.done ? "✓" : "";
  check.setAttribute("aria-pressed", String(t.done));
  check.setAttribute("aria-label", `${t.text} 완료 표시`);
  check.addEventListener("click", () => toggleTodo(wk, t.id));

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = t.text;

  const del = document.createElement("button");
  del.type = "button";
  del.className = "todo-del";
  del.textContent = "✕";
  del.setAttribute("aria-label", `${t.text} 삭제`);
  del.addEventListener("click", () => deleteTodo(wk, t.id));

  li.append(check, text, del);
  return li;
}

// 목록 맨 위에 붙는 입력칸. Enter로 계속 이어서 추가, Esc/포커스 이탈 시 닫힘
function buildTodoInput(wk) {
  const li = document.createElement("li");
  const input = document.createElement("input");
  input.type = "text";
  input.className = "todo-new";
  input.maxLength = 100;
  input.placeholder = "할 일을 입력하고 Enter";
  input.setAttribute("aria-label", "새 할 일");
  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return; // 한글 입력 조합 중 Enter 무시
    if (e.key === "Enter") {
      const text = input.value.trim();
      if (!text) return;
      input.dataset.closed = "1"; // 다시 그리면서 생기는 blur는 무시
      addTodo(wk, text);
      renderTodos();
      const next = document.querySelector(".todo-new");
      if (next) next.focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      input.dataset.closed = "1";
      todoAdding = null;
      renderTodos();
    }
  });
  input.addEventListener("blur", () => {
    if (input.dataset.closed || todoAdding !== wk) return;
    input.dataset.closed = "1";
    const text = input.value.trim();
    if (text) addTodo(wk, text);
    todoAdding = null;
    renderTodos();
  });
  li.append(input);
  return li;
}

function fillTodoList(ul, wk, emptyText) {
  ul.replaceChildren();
  if (todoAdding === wk) ul.append(buildTodoInput(wk));
  const list = todos[wk] || [];
  for (const t of list) ul.append(buildTodoItem(wk, t));
  if (!list.length && todoAdding !== wk) {
    const empty = document.createElement("li");
    empty.className = "todo-empty";
    empty.textContent = emptyText;
    ul.append(empty);
  }
}

function openAdd(wk) {
  todoAdding = wk;
  renderTodos();
  const input = document.querySelector(".todo-new");
  if (input) input.focus();
}

function renderTodos() {
  const thisWk = weekKey(0);
  todoRange.textContent = weekLabel(thisWk);
  fillTodoList(todoList, thisWk, "이번주 할 일을 추가해보세요");

  todoFolds.replaceChildren();
  [["prev", "지난주 할일", -1, "지난주에 적은 할 일이 없어요"], ["next", "다음주 할일", 1, "다음주 할 일을 미리 적어둘 수 있어요"]].forEach(
    ([id, label, offset, emptyText]) => {
      const wk = weekKey(offset);
      const fold = document.createElement("div");
      fold.className = "fold" + (foldOpen[id] ? " open" : "");

      const bar = document.createElement("button");
      bar.type = "button";
      bar.className = "fold-bar";
      bar.setAttribute("aria-expanded", String(foldOpen[id]));
      const name = document.createElement("span");
      name.textContent = label;
      const done = (todos[wk] || []).filter((t) => t.done).length;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = (todos[wk] || []).length ? `${done}/${todos[wk].length}` : "";
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "⌄";
      bar.append(name, count, arrow);
      bar.addEventListener("click", () => {
        foldOpen[id] = !foldOpen[id];
        renderTodos();
      });

      const body = document.createElement("div");
      body.className = "fold-body";
      const range = document.createElement("span");
      range.className = "fold-range";
      range.textContent = weekLabel(wk);
      body.append(range);
      if (offset > 0) {
        // 다음주는 미리 적을 수 있다
        const add = document.createElement("button");
        add.type = "button";
        add.className = "todo-add-btn";
        add.textContent = "+";
        add.setAttribute("aria-label", "다음주 할 일 추가");
        add.style.cssText = "width:26px;height:26px;font-size:1.05rem;float:right;margin-top:-20px";
        add.addEventListener("click", () => openAdd(wk));
        body.append(add);
      }
      const ul = document.createElement("ul");
      ul.className = "fold-list";
      fillTodoList(ul, wk, emptyText);
      body.append(ul);

      fold.append(bar, body);
      todoFolds.append(fold);
    }
  );
}

document.getElementById("todo-add").addEventListener("click", () => openAdd(weekKey(0)));

/* ---------- 토스트 ---------- */

let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2600);
}

/* ---------- 내보내기 / 불러오기 ---------- */

document.getElementById("export-btn").addEventListener("click", () => {
  const payload = { version: 1, exportedAt: new Date().toISOString(), events, todos };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const stamp = dateKey(now.getFullYear(), now.getMonth(), now.getDate()).replaceAll("-", "");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `planner-backup-${stamp}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`일정 ${countEvents(events)}개를 내보냈어요`);
});

document.getElementById("import-btn").addEventListener("click", () => importFile.click());

function askImportMode(count) {
  return new Promise((resolve) => {
    const mergeBtn = document.getElementById("choice-merge");
    const replaceBtn = document.getElementById("choice-replace");
    const cancelBtn = document.getElementById("choice-cancel");
    const finish = (value) => {
      choice.hidden = true;
      mergeBtn.onclick = replaceBtn.onclick = cancelBtn.onclick = null;
      resolve(value);
    };
    choiceText.textContent = `백업 파일에 일정 ${count}개가 들어 있어요. 어떻게 불러올까요?`;
    mergeBtn.onclick = () => finish("merge");
    replaceBtn.onclick = () => finish("replace");
    cancelBtn.onclick = () => finish(null);
    choice.hidden = false;
  });
}

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = ""; // 같은 파일을 다시 골라도 동작하게 한다
  if (!file) return;

  let imported = null;
  let importedTodos = null; // 예전 백업에는 없을 수 있다
  try {
    const data = JSON.parse(await file.text());
    if (data && typeof data === "object" && !Array.isArray(data)) {
      imported = normalizeEvents(data.events, true);
      if (imported && data.todos !== undefined) {
        importedTodos = normalizeTodos(data.todos, true);
        if (!importedTodos) imported = null;
      }
    }
  } catch {
    imported = null;
  }
  if (!imported) {
    toast("올바른 백업 파일이 아니에요");
    return;
  }

  const total = countEvents(imported);
  const mode = await askImportMode(total);
  if (!mode) return;

  let count = total;
  if (mode === "replace") {
    events = imported;
  } else {
    count = 0;
    for (const [key, list] of Object.entries(imported)) {
      const target = (events[key] ||= []);
      for (const ev of list) {
        if (target.some((x) => x.id === ev.id)) continue; // 같은 id는 중복 제거
        target.push(ev);
        count++;
      }
    }
  }
  save();
  if (importedTodos) {
    if (mode === "replace") {
      todos = importedTodos;
    } else {
      for (const [key, list] of Object.entries(importedTodos)) {
        const target = (todos[key] ||= []);
        for (const t of list) if (!target.some((x) => x.id === t.id)) target.push(t);
      }
    }
    saveTodos();
    renderTodos();
  }
  render();
  toast(`일정 ${count}개를 불러왔어요`);
});

render();
renderTodos();
