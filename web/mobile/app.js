const state = { token: localStorage.getItem('m-token') || '' };

async function api(path, method = 'GET', body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '요청 실패');
  return json;
}

function show(data) {
  document.getElementById('result').textContent = JSON.stringify(data, null, 2);
}

const val = (id) => document.getElementById(id).value;

document.getElementById('register').onclick = async () => {
  try {
    const data = await api('/auth/register', 'POST', {
      name: val('name'), role: val('role'), username: val('username'), password: val('password')
    });
    state.token = data.token;
    localStorage.setItem('m-token', state.token);
    show(data);
  } catch (err) { show({ error: err.message }); }
};

document.getElementById('login').onclick = async () => {
  try {
    const data = await api('/auth/login', 'POST', {
      username: val('username'), password: val('password')
    });
    state.token = data.token;
    localStorage.setItem('m-token', state.token);
    show(data);
  } catch (err) { show({ error: err.message }); }
};

document.getElementById('me').onclick = async () => { try { show(await api('/me')); } catch (err) { show({ error: err.message }); } };
document.getElementById('homeworks').onclick = async () => { try { show(await api('/homeworks')); } catch (err) { show({ error: err.message }); } };
document.getElementById('submissions').onclick = async () => { try { show(await api('/submissions')); } catch (err) { show({ error: err.message }); } };
document.getElementById('schema').onclick = async () => { try { show(await api('/schema-suggestion')); } catch (err) { show({ error: err.message }); } };

document.getElementById('createHomework').onclick = async () => {
  try {
    show(await api('/homeworks', 'POST', {
      content: val('text1'), count: Number(val('countOrRating')), deadline: val('deadline')
    }));
  } catch (err) { show({ error: err.message }); }
};

document.getElementById('submitHomework').onclick = async () => {
  try {
    show(await api('/submissions', 'POST', {
      homeworkId: val('homeworkId'), uploadText: val('text1'), teacherMessage: val('text2')
    }));
  } catch (err) { show({ error: err.message }); }
};

document.getElementById('createFeedback').onclick = async () => {
  try {
    show(await api('/feedbacks', 'POST', {
      submissionId: val('homeworkId'), rating: Number(val('countOrRating')), feedback: val('text2')
    }));
  } catch (err) { show({ error: err.message }); }
};
