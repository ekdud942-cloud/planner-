import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 웹 앱 설정값은 공개되어도 안전하다. 접근 제어는 Firestore 보안 규칙이 맡는다.
const firebaseConfig = {
  apiKey: "AIzaSyAUShx57HOu5hllfBezpVLRC1e-B6Hyj7Q",
  authDomain: "dayplanner-f3524.firebaseapp.com",
  projectId: "dayplanner-f3524",
  storageBucket: "dayplanner-f3524.firebasestorage.app",
  messagingSenderId: "841006307158",
  appId: "1:841006307158:web:aa8e35b5397aebba5628f7",
};

const api = window.plannerSync;
const btn = document.getElementById("login-btn");
const label = btn.querySelector(".label");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let ref = null;
let unsubscribe = null;
let pushTimer = null;

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function serialize(data) {
  return {
    events: JSON.stringify(data.events),
    todos: JSON.stringify(data.todos),
    updatedAt: serverTimestamp(),
  };
}

function fromDoc(d) {
  return api.normalize({ events: parse(d.events), todos: parse(d.todos) });
}

function setButton(user) {
  btn.hidden = false;
  btn.classList.toggle("on", !!user);
  label.textContent = user ? "동기화 중 · 로그아웃" : "구글 로그인";
  btn.setAttribute("aria-label", user ? "로그아웃" : "구글 로그인");
  btn.title = user ? `${user.email} 계정으로 동기화 중` : "로그인하면 폰과 PC가 연동돼요";
}

// 내용이 바뀌면 잠깐 모아서 서버에 저장한다
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (!ref) return;
    setDoc(ref, serialize(api.snapshot())).catch(() => api.toast("동기화에 실패했어요. 네트워크를 확인해주세요"));
  }, 600);
}

function stop() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  ref = null;
  api.onChange = null;
  clearTimeout(pushTimer);
}

onAuthStateChanged(auth, async (user) => {
  stop();
  setButton(user);
  if (!user) return;

  const mine = doc(db, "users", user.uid, "data", "planner");
  try {
    // 처음 연결할 때는 이 기기 데이터와 서버 데이터를 합쳐서 잃어버리는 게 없게 한다
    const snap = await getDoc(mine);
    const local = api.snapshot();
    const merged = snap.exists() ? api.merge(fromDoc(snap.data()), local) : local;
    api.apply(merged);
    await setDoc(mine, serialize(merged));
  } catch (e) {
    console.error(e);
    api.toast("동기화 연결에 실패했어요. Firestore 설정을 확인해주세요");
    return;
  }

  ref = mine;
  api.onChange = schedulePush;
  unsubscribe = onSnapshot(mine, (snap) => {
    // 내가 방금 보낸 변경은 무시하고, 다른 기기에서 바뀐 내용만 반영한다
    if (snap.metadata.hasPendingWrites || !snap.exists()) return;
    const incoming = fromDoc(snap.data());
    const current = api.snapshot();
    if (JSON.stringify(incoming) === JSON.stringify({ events: current.events, todos: current.todos })) return;
    api.apply(incoming);
  });
  api.toast("동기화가 연결됐어요");
});

btn.addEventListener("click", async () => {
  if (auth.currentUser) {
    await signOut(auth);
    api.toast("로그아웃했어요. 이 기기의 데이터는 그대로 남아 있어요");
    return;
  }
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked") {
      signInWithRedirect(auth, provider);
    } else if (e.code === "auth/unauthorized-domain") {
      api.toast("이 주소가 Firebase 승인된 도메인에 없어요");
    } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      console.error(e);
      api.toast("로그인에 실패했어요");
    }
  }
});
