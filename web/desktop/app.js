const apiBase = '/api';
const state = {
  token: localStorage.getItem('token') || '',
  role: localStorage.getItem('role') || '',
};
const authHeaders = () => ({ 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) });
const page = location.pathname.split('/').pop();

async function request(path, method = 'GET', body) {
  const res = await fetch(`${apiBase}${path}`, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '요청 실패');
  return json;
}

function loginAs(role) { localStorage.setItem('role', role); state.role = role; }

function setupIndex() {
  const teacherBtn = document.getElementById('teacherLogin');
  const studentBtn = document.getElementById('studentLogin');
  if (!teacherBtn) return;
  teacherBtn.onclick = () => { loginAs('teacher'); location.href = './teacher.html'; };
  studentBtn.onclick = () => { loginAs('student'); location.href = './student.html'; };

  document.getElementById('registerBtn').onclick = async () => {
    try {
      const role = state.role || 'student';
      const data = await request('/auth/register', 'POST', {
        name: document.getElementById('name').value || (role === 'teacher' ? '선생님' : '학생'),
        role,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      });
      state.token = data.token;
      localStorage.setItem('token', data.token);
      alert('회원가입/로그인 완료');
    } catch (e) { alert(e.message); }
  };

  document.getElementById('loginBtn').onclick = async () => {
    try {
      const data = await request('/auth/login', 'POST', {
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      });
      state.token = data.token;
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.user.role);
      alert('로그인 완료');
    } catch (e) { alert(e.message); }
  };
}

async function setupTeacher() {
  const form = document.getElementById('homeworkForm'); if (!form) return;
  const homeworkList = document.getElementById('homeworkList');
  const submissionList = document.getElementById('submissionList');

  const render = async () => {
    const homeworks = (await request('/homeworks')).homeworks;
    homeworkList.innerHTML = homeworks.length ? homeworks.map((h) => `<li><strong>${h.content}</strong><br/>숙제번호:${h.homeworkNumber} | 횟수:${h.count} | 기한:${h.deadline}</li>`).join('') : '<li>과제가 없습니다.</li>';

    const submissions = (await request('/submissions')).submissions;
    submissionList.innerHTML = submissions.length ? submissions.map((s) => `<li><strong>제출ID:</strong> ${s.id}<br/><strong>과제:</strong> ${s.homeworkContent}<br/><strong>학생:</strong> ${s.studentName || '-'}<br/><strong>제출:</strong> ${s.uploadText}<br/><strong>상태:</strong> ${s.checked ? '확인됨' : '미확인'}<br/><button class="inline-btn" data-id="${s.id}">과제 확인</button></li>`).join('') : '<li>제출물이 없습니다.</li>';

    submissionList.querySelectorAll('[data-id]').forEach((btn) => {
      btn.onclick = () => { location.href = `./feedback.html?submissionId=${btn.getAttribute('data-id')}`; };
    });
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await request('/homeworks', 'POST', {
        content: document.getElementById('content').value.trim(),
        count: Number(document.getElementById('count').value),
        deadline: document.getElementById('deadline').value,
      });
      form.reset();
      await render();
    } catch (err) { alert(err.message); }
  };

  await render();
}

async function setupStudent() {
  const list = document.getElementById('studentHomeworkList'); if (!list) return;
  const feedbackList = document.getElementById('feedbackList');
  const homeworks = (await request('/homeworks')).homeworks;
  list.innerHTML = homeworks.length ? homeworks.map((h) => `<li><strong>${h.content}</strong><br/>숙제번호:${h.homeworkNumber} | 횟수:${h.count} | 기한:${h.deadline}<br/><a class="link-btn" href="./submit.html?homeworkId=${h.id}">이 과제 실행/제출하기</a></li>`).join('') : '<li>과제가 없습니다.</li>';

  const submissions = (await request('/submissions')).submissions;
  const feedbacks = submissions.filter((s) => s.feedback);
  feedbackList.innerHTML = feedbacks.length ? feedbacks.map((s) => `<li><strong>${s.homeworkContent}</strong><br/>별점: ${'⭐'.repeat(s.feedback.rating)} (${s.feedback.rating}/5)<br/>피드백: ${s.feedback.feedback}</li>`).join('') : '<li>아직 받은 피드백이 없습니다.</li>';
}

async function setupSubmit() {
  const selected = document.getElementById('selectedHomework'); if (!selected) return;
  const form = document.getElementById('submissionForm');
  const homeworkId = new URLSearchParams(location.search).get('homeworkId');
  const homeworks = (await request('/homeworks')).homeworks;
  const homework = homeworks.find((h) => h.id === homeworkId);
  if (!homework) { selected.innerHTML = '<p>선택한 과제를 찾을 수 없습니다.</p>'; form.classList.add('hidden'); return; }
  selected.innerHTML = `<p><strong>${homework.content}</strong></p><p>횟수: ${homework.count}회</p><p>제출기한: ${homework.deadline}</p><p>숙제번호: ${homework.homeworkNumber}</p>`;

  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await request('/submissions', 'POST', { homeworkId, uploadText: document.getElementById('uploadText').value.trim(), teacherMessage: document.getElementById('teacherMessage').value.trim() });
      alert('제출 완료');
      location.href = './student.html';
    } catch (err) { alert(err.message); }
  };
}

async function setupFeedback() {
  const detail = document.getElementById('submissionDetail'); if (!detail) return;
  const form = document.getElementById('feedbackForm');
  const submissionId = new URLSearchParams(location.search).get('submissionId');
  const submissions = (await request('/submissions')).submissions;
  const submission = submissions.find((s) => s.id === submissionId);
  if (!submission) { detail.innerHTML = '<p>제출 정보를 찾을 수 없습니다.</p>'; form.classList.add('hidden'); return; }
  detail.innerHTML = `<p><strong>과제:</strong> ${submission.homeworkContent}</p><p><strong>제출 내용:</strong> ${submission.uploadText}</p><p><strong>학생:</strong> ${submission.studentName || '-'}</p>`;

  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await request('/feedbacks', 'POST', { submissionId, rating: Number(document.getElementById('rating').value), feedback: document.getElementById('feedbackText').value.trim() });
      alert('피드백 저장 완료');
      location.href = './teacher.html';
    } catch (err) { alert(err.message); }
  };
}

async function setupDecorate() {
  const star = document.getElementById('starBalance'); if (!star) return;
  const buy = document.getElementById('buyDeskBtn');
  const place = document.getElementById('placeDeskBtn');
  const desk = document.getElementById('desk');
  const text = document.getElementById('itemOwnedText');

  const render = async () => {
    const profile = (await request('/student/profile')).profile;
    star.textContent = profile.stars;
    text.textContent = profile.inventory.desk1 ? '책상1 보유 중' : '책상1 미보유';
    desk.classList.toggle('hidden', !profile.placed.desk1);
  };

  buy.onclick = async () => { try { await request('/student/buy-desk1', 'POST', {}); await render(); } catch (e) { alert(e.message); } };
  place.onclick = async () => { try { await request('/student/toggle-desk1', 'POST', {}); await render(); } catch (e) { alert(e.message); } };
  await render();
}

(async function init() {
  try {
    if (page !== 'index.html') await request('/me');
    await setupTeacher(); await setupStudent(); await setupSubmit(); await setupFeedback(); await setupDecorate(); setupIndex();
  } catch (e) {
    if (page !== 'index.html') {
      alert('로그인이 필요합니다.');
      location.href = './index.html';
    } else {
      setupIndex();
    }
  }
})();
