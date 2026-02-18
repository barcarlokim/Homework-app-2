const store = {
  get(key, fallback = []) {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

const assignId = () => crypto.randomUUID();

function seedStudentData() {
  if (!localStorage.getItem("studentProfile")) {
    store.set("studentProfile", {
      stars: 0,
      inventory: { desk1: false },
      placed: { desk1: false },
    });
  }
}

function setupIndexPage() {
  const teacherBtn = document.getElementById("teacherLogin");
  const studentBtn = document.getElementById("studentLogin");
  if (!teacherBtn || !studentBtn) return;

  teacherBtn.onclick = () => (window.location.href = "teacher.html");
  studentBtn.onclick = () => {
    seedStudentData();
    window.location.href = "student.html";
  };
}

function setupTeacherPage() {
  const form = document.getElementById("homeworkForm");
  const homeworkList = document.getElementById("homeworkList");
  const submissionList = document.getElementById("submissionList");
  if (!form || !homeworkList || !submissionList) return;

  const render = () => {
    const homeworks = store.get("homeworks");
    homeworkList.innerHTML = homeworks
      .map(
        (h) =>
          `<li><strong>${h.content}</strong><br/>횟수: ${h.count}회 | 제출기한: ${h.deadline}</li>`
      )
      .join("");

    const submissions = store.get("submissions");
    submissionList.innerHTML = submissions.length
      ? submissions
          .map(
            (s) => `<li>
              <strong>과제:</strong> ${s.homeworkContent}<br/>
              <strong>제출:</strong> ${s.uploadText}<br/>
              <strong>학생 메시지:</strong> ${s.teacherMessage || "(없음)"}<br/>
              <strong>상태:</strong> ${s.checked ? "확인됨" : "미확인"}<br/>
              <button class="inline-btn" data-check-id="${s.id}">과제 확인</button>
            </li>`
          )
          .join("")
      : "<li>아직 제출된 과제가 없습니다.</li>";

    submissionList.querySelectorAll("[data-check-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-check-id");
        const updated = store.get("submissions").map((s) =>
          s.id === id ? { ...s, checked: true } : s
        );
        store.set("submissions", updated);
        window.location.href = `feedback.html?submissionId=${id}`;
      });
    });
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const content = document.getElementById("content").value.trim();
    const count = document.getElementById("count").value;
    const deadline = document.getElementById("deadline").value;

    const homeworks = store.get("homeworks");
    homeworks.push({ id: assignId(), content, count, deadline });
    store.set("homeworks", homeworks);
    form.reset();
    render();
  });

  render();
}

function setupStudentPage() {
  const list = document.getElementById("studentHomeworkList");
  const feedbackList = document.getElementById("feedbackList");
  if (!list || !feedbackList) return;

  const homeworks = store.get("homeworks");
  list.innerHTML = homeworks.length
    ? homeworks
        .map(
          (h) => `<li>
            <strong>${h.content}</strong><br/>
            횟수: ${h.count}회 | 제출기한: ${h.deadline}<br/>
            <a class="link-btn" href="submit.html?homeworkId=${h.id}">이 과제 실행/제출하기</a>
          </li>`
        )
        .join("")
    : "<li>제안된 과제가 없습니다.</li>";

  const feedbacks = store.get("feedbacks");
  feedbackList.innerHTML = feedbacks.length
    ? feedbacks
        .map(
          (f) => `<li>
            <strong>${f.homeworkContent}</strong><br/>
            별점: ${"⭐".repeat(f.rating)} (${f.rating}/5)<br/>
            피드백: ${f.feedbackText}
          </li>`
        )
        .join("")
    : "<li>아직 받은 피드백이 없습니다.</li>";
}

function setupSubmitPage() {
  const selectedHomework = document.getElementById("selectedHomework");
  const form = document.getElementById("submissionForm");
  if (!selectedHomework || !form) return;

  const params = new URLSearchParams(window.location.search);
  const homeworkId = params.get("homeworkId");
  const homework = store.get("homeworks").find((h) => h.id === homeworkId);

  if (!homework) {
    selectedHomework.innerHTML = "<p>선택한 과제를 찾을 수 없습니다.</p>";
    form.classList.add("hidden");
    return;
  }

  selectedHomework.innerHTML = `
    <p><strong>${homework.content}</strong></p>
    <p>횟수: ${homework.count}회</p>
    <p>제출기한: ${homework.deadline}</p>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const uploadText = document.getElementById("uploadText").value.trim();
    const teacherMessage = document.getElementById("teacherMessage").value.trim();

    const submissions = store.get("submissions");
    submissions.push({
      id: assignId(),
      homeworkId,
      homeworkContent: homework.content,
      uploadText,
      teacherMessage,
      checked: false,
    });
    store.set("submissions", submissions);
    alert("제출이 완료되었습니다.");
    window.location.href = "student.html";
  });
}

function setupFeedbackPage() {
  const detail = document.getElementById("submissionDetail");
  const form = document.getElementById("feedbackForm");
  if (!detail || !form) return;

  const params = new URLSearchParams(window.location.search);
  const submissionId = params.get("submissionId");
  const submission = store.get("submissions").find((s) => s.id === submissionId);

  if (!submission) {
    detail.innerHTML = "<p>제출 정보를 찾을 수 없습니다.</p>";
    form.classList.add("hidden");
    return;
  }

  detail.innerHTML = `
    <p><strong>과제:</strong> ${submission.homeworkContent}</p>
    <p><strong>제출 내용:</strong> ${submission.uploadText}</p>
    <p><strong>학생 메시지:</strong> ${submission.teacherMessage || "(없음)"}</p>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const rating = Number(document.getElementById("rating").value);
    const feedbackText = document.getElementById("feedbackText").value.trim();

    const feedbacks = store.get("feedbacks");
    feedbacks.push({
      id: assignId(),
      submissionId,
      homeworkContent: submission.homeworkContent,
      rating,
      feedbackText,
    });
    store.set("feedbacks", feedbacks);

    const profile = store.get("studentProfile", {
      stars: 0,
      inventory: { desk1: false },
      placed: { desk1: false },
    });
    profile.stars += rating;
    store.set("studentProfile", profile);

    alert("피드백 저장 완료");
    window.location.href = "teacher.html";
  });
}

function setupDecoratePage() {
  seedStudentData();
  const starBalance = document.getElementById("starBalance");
  const buyDeskBtn = document.getElementById("buyDeskBtn");
  const placeDeskBtn = document.getElementById("placeDeskBtn");
  const desk = document.getElementById("desk");
  const itemOwnedText = document.getElementById("itemOwnedText");

  if (!starBalance || !buyDeskBtn || !placeDeskBtn || !desk || !itemOwnedText) return;

  const render = () => {
    const profile = store.get("studentProfile", {
      stars: 0,
      inventory: { desk1: false },
      placed: { desk1: false },
    });
    starBalance.textContent = profile.stars;
    itemOwnedText.textContent = profile.inventory.desk1
      ? "책상1 보유 중"
      : "책상1 미보유";
    desk.classList.toggle("hidden", !profile.placed.desk1);
  };

  buyDeskBtn.addEventListener("click", () => {
    const profile = store.get("studentProfile");
    if (profile.inventory.desk1) {
      alert("이미 책상1을 보유 중입니다.");
      return;
    }
    if (profile.stars < 5) {
      alert("별점이 부족합니다. 좋은 피드백을 더 받아보세요!");
      return;
    }
    profile.stars -= 5;
    profile.inventory.desk1 = true;
    store.set("studentProfile", profile);
    render();
  });

  placeDeskBtn.addEventListener("click", () => {
    const profile = store.get("studentProfile");
    if (!profile.inventory.desk1) {
      alert("먼저 책상1을 구매하세요.");
      return;
    }
    profile.placed.desk1 = !profile.placed.desk1;
    store.set("studentProfile", profile);
    render();
  });

  render();
}

setupIndexPage();
setupTeacherPage();
setupStudentPage();
setupSubmitPage();
setupFeedbackPage();
setupDecoratePage();
