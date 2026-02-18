const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24;

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [],
      homeworks: [],
      submissions: [],
      feedbacks: [],
      sessions: [],
      studentProfiles: [],
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  db.studentProfiles = db.studentProfiles || [];
  return db;
}
function writeDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8'); }

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON body')); }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};
const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
};

function uid() { return crypto.randomUUID(); }
function normalizeRole(role) { return role === 'teacher' || role === 'student' ? role : null; }
function pickPublicUser(user) {
  return { id: user.id, name: user.name, role: user.role, username: user.username, createdAt: user.createdAt };
}

function issueToken(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ token, userId, expiresAt: Date.now() + TOKEN_TTL_MS });
  writeDb(db);
  return token;
}
function getUserFromAuth(req, db) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const session = db.sessions.find((s) => s.token === token && s.expiresAt > Date.now());
  if (!session) return null;
  return db.users.find((u) => u.id === session.userId) || null;
}

function ensureStudentProfile(db, studentId) {
  let profile = db.studentProfiles.find((p) => p.studentId === studentId);
  if (!profile) {
    profile = {
      id: uid(),
      studentId,
      stars: 0,
      inventory: { desk1: false },
      placed: { desk1: false },
      updatedAt: new Date().toISOString(),
    };
    db.studentProfiles.push(profile);
  }
  return profile;
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/desktop/index.html' : req.url;
  const decoded = decodeURIComponent(urlPath.split('?')[0]);

  const webRoot = path.join(__dirname, '..', 'web');
  const repoRoot = path.join(__dirname, '..');
  const candidate = decoded.startsWith('/desktop/') || decoded.startsWith('/mobile/')
    ? path.normalize(path.join(webRoot, decoded))
    : path.normalize(path.join(repoRoot, decoded));

  const allowed = [webRoot, repoRoot].some((root) => candidate.startsWith(root));
  if (!allowed) {
    res.writeHead(403); res.end('Forbidden'); return true;
  }
  if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) return false;

  const ext = path.extname(candidate);
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  }[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(candidate).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  if (req.url.startsWith('/api/')) {
    const db = readDb();
    try {
      if (req.method === 'POST' && req.url === '/api/auth/register') {
        const { name, role, username, password } = await parseBody(req);
        if (!name || !username || !password || !normalizeRole(role)) return sendJson(res, 400, { error: 'name, role, username, password 필수' });
        if (password.length < 8) return sendJson(res, 400, { error: '비밀번호는 8자 이상이어야 합니다.' });
        if (db.users.some((u) => u.username === username)) return sendJson(res, 409, { error: '이미 사용 중인 아이디입니다.' });

        const user = { id: uid(), name, role, username, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
        db.users.push(user);
        if (role === 'student') ensureStudentProfile(db, user.id);
        writeDb(db);
        const token = issueToken(db, user.id);
        return sendJson(res, 201, { token, user: pickPublicUser(user) });
      }

      if (req.method === 'POST' && req.url === '/api/auth/login') {
        const { username, password } = await parseBody(req);
        const user = db.users.find((u) => u.username === username);
        if (!user || !verifyPassword(password || '', user.passwordHash)) return sendJson(res, 401, { error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        const token = issueToken(db, user.id);
        return sendJson(res, 200, { token, user: pickPublicUser(user) });
      }

      if (req.method === 'GET' && req.url === '/api/me') {
        const user = getUserFromAuth(req, db);
        if (!user) return sendJson(res, 401, { error: '인증 필요' });
        return sendJson(res, 200, { user: pickPublicUser(user) });
      }

      if (req.method === 'POST' && req.url === '/api/homeworks') {
        const user = getUserFromAuth(req, db);
        if (!user || user.role !== 'teacher') return sendJson(res, 403, { error: '선생님만 가능' });
        const { content, count, deadline } = await parseBody(req);
        if (!content || !count || !deadline) return sendJson(res, 400, { error: 'content, count, deadline 필수' });

        const homework = {
          id: uid(), teacherId: user.id,
          homeworkNumber: `HW-${String(db.homeworks.length + 1).padStart(4, '0')}`,
          content, count: Number(count), deadline, status: 'assigned', createdAt: new Date().toISOString(),
        };
        db.homeworks.push(homework); writeDb(db);
        return sendJson(res, 201, { homework });
      }

      if (req.method === 'GET' && req.url === '/api/homeworks') {
        const user = getUserFromAuth(req, db);
        if (!user) return sendJson(res, 401, { error: '인증 필요' });
        const homeworks = user.role === 'teacher' ? db.homeworks.filter((h) => h.teacherId === user.id) : db.homeworks;
        return sendJson(res, 200, { homeworks });
      }

      if (req.method === 'POST' && req.url === '/api/submissions') {
        const user = getUserFromAuth(req, db);
        if (!user || user.role !== 'student') return sendJson(res, 403, { error: '학생만 가능' });
        const { homeworkId, uploadText, teacherMessage } = await parseBody(req);
        const homework = db.homeworks.find((h) => h.id === homeworkId);
        if (!homework) return sendJson(res, 404, { error: '과제를 찾을 수 없습니다.' });

        const submission = { id: uid(), homeworkId, studentId: user.id, uploadText, teacherMessage: teacherMessage || '', checked: false, createdAt: new Date().toISOString() };
        db.submissions.push(submission); writeDb(db);
        return sendJson(res, 201, { submission });
      }

      if (req.method === 'GET' && req.url === '/api/submissions') {
        const user = getUserFromAuth(req, db);
        if (!user) return sendJson(res, 401, { error: '인증 필요' });
        const submissions = user.role === 'teacher'
          ? db.submissions.filter((s) => db.homeworks.find((h) => h.id === s.homeworkId)?.teacherId === user.id)
          : db.submissions.filter((s) => s.studentId === user.id);
        const enriched = submissions.map((s) => {
          const homework = db.homeworks.find((h) => h.id === s.homeworkId);
          const student = db.users.find((u) => u.id === s.studentId);
          const feedback = db.feedbacks.find((f) => f.submissionId === s.id);
          return { ...s, homeworkNumber: homework?.homeworkNumber, homeworkContent: homework?.content, studentName: student?.name, feedback };
        });
        return sendJson(res, 200, { submissions: enriched });
      }

      if (req.method === 'POST' && req.url === '/api/feedbacks') {
        const user = getUserFromAuth(req, db);
        if (!user || user.role !== 'teacher') return sendJson(res, 403, { error: '선생님만 가능' });
        const { submissionId, rating, feedback } = await parseBody(req);
        const submission = db.submissions.find((s) => s.id === submissionId);
        if (!submission) return sendJson(res, 404, { error: '제출물을 찾을 수 없습니다.' });
        if (db.feedbacks.some((f) => f.submissionId === submissionId)) return sendJson(res, 409, { error: '이미 피드백이 등록된 제출물입니다.' });

        const homework = db.homeworks.find((h) => h.id === submission.homeworkId);
        if (!homework || homework.teacherId !== user.id) return sendJson(res, 403, { error: '권한 없음' });

        const feedbackData = { id: uid(), submissionId, teacherId: user.id, rating: Math.max(1, Math.min(5, Number(rating))), feedback, createdAt: new Date().toISOString() };
        db.feedbacks.push(feedbackData);
        submission.checked = true;

        const profile = ensureStudentProfile(db, submission.studentId);
        profile.stars += feedbackData.rating;
        profile.updatedAt = new Date().toISOString();

        writeDb(db);
        return sendJson(res, 201, { feedback: feedbackData, awardedStars: feedbackData.rating, currentStars: profile.stars });
      }

      if (req.method === 'GET' && req.url === '/api/student/profile') {
        const user = getUserFromAuth(req, db);
        if (!user || user.role !== 'student') return sendJson(res, 403, { error: '학생만 가능' });
        const profile = ensureStudentProfile(db, user.id);
        writeDb(db);
        return sendJson(res, 200, { profile });
      }

      if (req.method === 'POST' && req.url === '/api/student/buy-desk1') {
        const user = getUserFromAuth(req, db);
        if (!user || user.role !== 'student') return sendJson(res, 403, { error: '학생만 가능' });
        const profile = ensureStudentProfile(db, user.id);
        if (profile.inventory.desk1) return sendJson(res, 400, { error: '이미 보유 중입니다.' });
        if (profile.stars < 5) return sendJson(res, 400, { error: '별점이 부족합니다.' });
        profile.stars -= 5;
        profile.inventory.desk1 = true;
        profile.updatedAt = new Date().toISOString();
        writeDb(db);
        return sendJson(res, 200, { profile });
      }

      if (req.method === 'POST' && req.url === '/api/student/toggle-desk1') {
        const user = getUserFromAuth(req, db);
        if (!user || user.role !== 'student') return sendJson(res, 403, { error: '학생만 가능' });
        const profile = ensureStudentProfile(db, user.id);
        if (!profile.inventory.desk1) return sendJson(res, 400, { error: '먼저 구매하세요.' });
        profile.placed.desk1 = !profile.placed.desk1;
        profile.updatedAt = new Date().toISOString();
        writeDb(db);
        return sendJson(res, 200, { profile });
      }

      if (req.method === 'GET' && req.url === '/api/schema-suggestion') {
        return sendJson(res, 200, {
          requiredFields: ['name', 'role(teacher/student)', 'username', 'passwordHash', 'homeworkNumber', 'content', 'count', 'deadline', 'feedback'],
          recommendedFields: ['user.id(UUID)', 'createdAt', 'updatedAt', 'submission.status', 'feedback.rating(1~5)', 'teacherMessage', 'sessionToken', 'lastLoginAt', 'deviceId', 'pushToken'],
        });
      }

      return sendJson(res, 404, { error: 'API Not Found' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (!serveStatic(req, res)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

ensureDb();
server.listen(PORT, () => {
  console.log(`API server running on http://0.0.0.0:${PORT}`);
  console.log(`Desktop web: http://0.0.0.0:${PORT}/desktop/index.html`);
  console.log(`Mobile web: http://0.0.0.0:${PORT}/mobile/index.html`);
});
