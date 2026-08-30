// ---------- পরীক্ষা (Exam) — full-page realtime exam-link list ----------
// Admin adds/edits/deletes exam links from admin.html (Firestore `exams`
// collection). This file only READS that collection in realtime and shows
// each link to normal users on its own bottom-nav page (view-exam) — no
// admin controls live in the main app at all, so a regular visitor can
// never see or touch anything admin-only.
// Firestore security is enforced server-side in firestore.rules
// (`allow write: if isAdmin()` on the `exams` collection) — anything here
// is only for the UI.

let examUnsub = null;
let examListCache = [];
let examListenerStarted = false;

// Called once from js/app.js during startup. The listener is opened right
// away (not only when the tab is first tapped) so the page is already
// populated the instant someone switches to it — same as how the surah
// list is fetched once up front instead of on first tab-open.
function initExam(){
  startExamRealtime();
}

// Called every time the "পরীক্ষা" tab (bottom nav or drawer) is opened.
function onExamViewOpened(){
  const container = document.getElementById('examListContainer');
  if(!container) return;
  if(examListenerStarted) renderExamList(container);
  else startExamRealtime();
}

function startExamRealtime(){
  const container = document.getElementById('examListContainer');
  if(!container) return;

  if(typeof fbDb === 'undefined' || !fbDb || !firebaseReady){
    // Firebase not ready yet (e.g. still loading on first paint) — retry
    // shortly instead of showing a false "failed" message.
    if(!examListenerStarted) setTimeout(startExamRealtime, 800);
    return;
  }
  if(examUnsub) return; // already listening

  examListenerStarted = true;
  examUnsub = fbDb.collection('exams').orderBy('createdAt', 'desc')
    .onSnapshot(
      (snap) => {
        examListCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderExamList(container);
      },
      (err) => {
        console.warn('Exam list listener failed:', err);
        container.innerHTML = `<div class="error-box">পরীক্ষার তালিকা লোড করা যায়নি।<br><button onclick="startExamRealtimeRetry()">আবার চেষ্টা করুন</button></div>`;
      }
    );
}

function startExamRealtimeRetry(){
  if(examUnsub){ examUnsub(); examUnsub = null; }
  examListenerStarted = false;
  startExamRealtime();
}

function renderExamList(container){
  if(!examListCache.length){
    container.innerHTML = `<div class="error-box">এখন কোনো পরীক্ষা চালু নেই। নতুন পরীক্ষা যোগ হলে এখানেই দেখা যাবে।</div>`;
    return;
  }
  container.innerHTML = '';
  examListCache.forEach(exam => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.style.cursor = 'pointer';
    item.innerHTML = `
      <div class="badge-num"><i class="fa-solid fa-pen-to-square"></i></div>
      <div class="li-text">
        <div class="li-title">${escapeHtml(exam.title || 'পরীক্ষা')}</div>
        ${exam.description ? `<div class="li-sub">${escapeHtml(exam.description)}</div>` : ''}
      </div>
      <div class="li-meta"><i class="fa-solid fa-arrow-up-right-from-square"></i></div>`;
    item.onclick = () => {
      if(exam.link) window.open(exam.link, '_blank', 'noopener');
    };
    container.appendChild(item);
  });
}
