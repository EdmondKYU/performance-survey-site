const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const PORT = Number(process.env.PORT || 4768);
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const sessions = new Map();

const questionKeys = ["usefulness", "insight", "clarity", "caseQuality", "interaction"];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) return;

  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";

  const db = {
    users: [
      {
        id: "admin_default",
        role: "admin",
        name: "系统管理员",
        email: adminEmail.toLowerCase(),
        password: hashPassword(adminPassword),
        createdAt: nowIso()
      }
    ],
    courses: [],
    responses: []
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function readDb() {
  ensureDataFile();
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (ensureConfiguredAdmin(db)) {
    writeDb(db);
  }
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function ensureConfiguredAdmin(db) {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123456";
  let changed = false;

  let admin = db.users.find((user) => user.role === "admin" && user.email === adminEmail);
  if (!admin) {
    admin = {
      id: makeId("admin"),
      role: "admin",
      name: "系统管理员",
      email: adminEmail,
      password: hashPassword(adminPassword),
      createdAt: nowIso()
    };
    db.users.push(admin);
    changed = true;
  }

  if (!verifyPassword(adminPassword, admin.password)) {
    admin.password = hashPassword(adminPassword);
    changed = true;
  }

  return changed;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return { salt, hash, iterations };
}

function verifyPassword(password, stored) {
  if (!stored || !stored.salt || !stored.hash) return false;
  const hash = crypto.pbkdf2Sync(password, stored.salt, stored.iterations || 120000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(stored.hash, "hex"));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function parseCookies(header = "") {
  return header.split(";").reduce((cookies, item) => {
    const index = item.indexOf("=");
    if (index < 0) return cookies;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

function getSessionUser(req, db) {
  const token = parseCookies(req.headers.cookie || "").session;
  const session = sessions.get(token);
  if (!session) return { user: null, token: null };
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return { user: null, token: null };
  }
  const user = db.users.find((item) => item.id === session.userId);
  return { user, token };
}

function send(res, statusCode, payload, headers = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": typeof payload === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers
  });
  res.end(body);
}

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("请求内容过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON 格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function interpolate(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMax;
  const clamped = Math.min(Math.max(value, inMin), inMax);
  return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
}

function mapKpiScore(satisfaction) {
  if (satisfaction === null || satisfaction === undefined) {
    return { score: null, weightedScore: null, band: "暂无数据" };
  }

  let score = 0;
  let band = "满意度不足 77%，此项考核为 0";

  if (satisfaction >= 95) {
    score = interpolate(satisfaction, 95, 100, 100, 120);
    band = "满意度 95% 以上，对应 120-100 分";
  } else if (satisfaction >= 89) {
    score = interpolate(satisfaction, 89, 94, 85, 100);
    band = "满意度 94%-89%，对应 100-85 分";
  } else if (satisfaction >= 81) {
    score = interpolate(satisfaction, 81, 88, 70, 84);
    band = "满意度 88%-81%，对应 84-70 分";
  } else if (satisfaction >= 77) {
    score = interpolate(satisfaction, 77, 80, 60, 69);
    band = "满意度 80%-77%，对应 69-60 分";
  }

  const rounded = round(score, 1);
  return {
    score: rounded,
    weightedScore: round(rounded * 0.3, 1),
    band
  };
}

function computeStats(responses) {
  const count = responses.length;
  const totals = responses.map((response) => response.total);
  const rawAverage = count ? totals.reduce((sum, total) => sum + total, 0) / count : null;

  let trimmed = responses.slice();
  let trimNote = "样本少于 3 份，暂不剔除最高分和最低分";
  let removedHigh = null;
  let removedLow = null;

  if (count >= 3) {
    const sorted = responses.slice().sort((a, b) => a.total - b.total || a.createdAt.localeCompare(b.createdAt));
    removedLow = sorted[0];
    removedHigh = sorted[sorted.length - 1];
    trimmed = sorted.slice(1, -1);
    trimNote = "已剔除 1 个最高总分和 1 个最低总分";
  }

  const trimmedCount = trimmed.length;
  const trimmedAverage = trimmedCount
    ? trimmed.reduce((sum, response) => sum + response.total, 0) / trimmedCount
    : rawAverage;
  const satisfaction = trimmedAverage === null ? null : trimmedAverage;
  const kpi = mapKpiScore(satisfaction);

  const dimensionAverages = questionKeys.reduce((result, key) => {
    result[key] = trimmedCount
      ? round(trimmed.reduce((sum, response) => sum + Number(response.scores[key] || 0), 0) / trimmedCount, 1)
      : null;
    return result;
  }, {});

  return {
    count,
    rawAverage: round(rawAverage, 1),
    trimmedCount,
    trimmedAverage: round(trimmedAverage, 1),
    satisfaction: round(satisfaction, 1),
    kpiScore: kpi.score,
    weightedScore: kpi.weightedScore,
    band: kpi.band,
    trimNote,
    removedHigh: removedHigh ? responseSummary(removedHigh) : null,
    removedLow: removedLow ? responseSummary(removedLow) : null,
    dimensionAverages
  };
}

function responseSummary(response) {
  return {
    id: response.id,
    total: response.total,
    participantName: response.participantName || "匿名",
    createdAt: response.createdAt
  };
}

function courseSummary(course, db) {
  const teacher = db.users.find((user) => user.id === course.teacherId);
  const responses = db.responses.filter((response) => response.courseId === course.id);
  return {
    ...course,
    teacherName: teacher ? teacher.name : "未知讲师",
    teacherEmail: teacher ? teacher.email : "",
    stats: computeStats(responses)
  };
}

function validateScores(scores) {
  if (!scores || typeof scores !== "object") return null;

  const clean = {};
  for (const key of questionKeys) {
    const value = asNumber(scores[key]);
    if (value === null || value < 0 || value > 20) return null;
    clean[key] = Math.round(value * 10) / 10;
  }
  return clean;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(db) {
  const headers = [
    "提交时间",
    "讲师",
    "讲师邮箱",
    "课程",
    "学员",
    "部门",
    "内容实用度",
    "见解深度",
    "结构清晰度",
    "案例质量",
    "互动参与感",
    "总分",
    "建议"
  ];

  const rows = db.responses.map((response) => {
    const course = db.courses.find((item) => item.id === response.courseId);
    const teacher = db.users.find((item) => item.id === response.teacherId);
    return [
      response.createdAt,
      teacher ? teacher.name : "",
      teacher ? teacher.email : "",
      course ? course.title : "",
      response.participantName || "匿名",
      response.department || "",
      response.scores.usefulness,
      response.scores.insight,
      response.scores.clarity,
      response.scores.caseQuality,
      response.scores.interaction,
      response.total,
      response.comment || ""
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function handleApi(req, res, pathname) {
  const db = readDb();
  const { user, token } = getSessionUser(req, db);

  if (req.method === "GET" && pathname === "/api/auth/me") {
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (name.length < 2) return sendError(res, 400, "请填写讲师姓名");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendError(res, 400, "邮箱格式不正确");
    if (password.length < 6) return sendError(res, 400, "密码至少 6 位");
    if (db.users.some((item) => item.email === email)) return sendError(res, 409, "该邮箱已注册");

    const newUser = {
      id: makeId("teacher"),
      role: "teacher",
      name,
      email,
      password: hashPassword(password),
      createdAt: nowIso()
    };

    db.users.push(newUser);
    writeDb(db);

    const sessionToken = createSession(newUser.id);
    return sendJson(res, 201, { user: publicUser(newUser) }, {
      "Set-Cookie": `session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
    });
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const found = db.users.find((item) => item.email === email);

    if (!found || !verifyPassword(password, found.password)) return sendError(res, 401, "邮箱或密码不正确");

    const sessionToken = createSession(found.id);
    return sendJson(res, 200, { user: publicUser(found) }, {
      "Set-Cookie": `session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
    });
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    destroySession(token);
    return sendJson(res, 200, { ok: true }, {
      "Set-Cookie": "session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    });
  }

  const publicCourseMatch = pathname.match(/^\/api\/public\/courses\/([^/]+)$/);
  if (req.method === "GET" && publicCourseMatch) {
    const course = db.courses.find((item) => item.id === publicCourseMatch[1]);
    if (!course) return sendError(res, 404, "课程不存在");
    const teacher = db.users.find((item) => item.id === course.teacherId);
    return sendJson(res, 200, {
      course: {
        id: course.id,
        title: course.title,
        category: course.category,
        scheduledAt: course.scheduledAt,
        description: course.description,
        active: course.active
      },
      teacher: teacher ? { id: teacher.id, name: teacher.name } : null
    });
  }

  const responseMatch = pathname.match(/^\/api\/public\/courses\/([^/]+)\/responses$/);
  if (req.method === "POST" && responseMatch) {
    const course = db.courses.find((item) => item.id === responseMatch[1]);
    if (!course) return sendError(res, 404, "课程不存在");
    if (!course.active) return sendError(res, 403, "该课程问卷已关闭");

    const body = await readBody(req);
    const scores = validateScores(body.scores);
    if (!scores) return sendError(res, 400, "评分必须在 0-20 分之间");

    const total = questionKeys.reduce((sum, key) => sum + scores[key], 0);
    const response = {
      id: makeId("resp"),
      courseId: course.id,
      teacherId: course.teacherId,
      participantName: String(body.participantName || "").trim().slice(0, 40),
      department: String(body.department || "").trim().slice(0, 60),
      scores,
      total: round(total, 1),
      comment: String(body.comment || "").trim().slice(0, 800),
      createdAt: nowIso()
    };

    db.responses.push(response);
    writeDb(db);
    return sendJson(res, 201, { response: responseSummary(response) });
  }

  if (!user) return sendError(res, 401, "请先登录");

  if (req.method === "POST" && pathname === "/api/courses") {
    if (user.role !== "teacher") return sendError(res, 403, "只有讲师可以创建课程");
    const body = await readBody(req);
    const title = String(body.title || "").trim();
    if (title.length < 2) return sendError(res, 400, "请填写课程名称");

    const course = {
      id: makeId("course"),
      teacherId: user.id,
      title: title.slice(0, 80),
      category: String(body.category || "知识分享/项目复盘分享").trim().slice(0, 60),
      scheduledAt: String(body.scheduledAt || "").trim().slice(0, 40),
      description: String(body.description || "").trim().slice(0, 300),
      active: true,
      createdAt: nowIso()
    };

    db.courses.push(course);
    writeDb(db);
    return sendJson(res, 201, { course: courseSummary(course, db) });
  }

  const updateCourseMatch = pathname.match(/^\/api\/courses\/([^/]+)$/);
  if (["PATCH", "DELETE"].includes(req.method) && updateCourseMatch) {
    const course = db.courses.find((item) => item.id === updateCourseMatch[1]);
    if (!course) return sendError(res, 404, "课程不存在");
    if (user.role !== "admin" && course.teacherId !== user.id) return sendError(res, 403, "无权操作该课程");

    if (req.method === "DELETE") {
      course.active = false;
      writeDb(db);
      return sendJson(res, 200, { course: courseSummary(course, db) });
    }

    const body = await readBody(req);
    if (typeof body.active === "boolean") course.active = body.active;
    if (body.title !== undefined) {
      const title = String(body.title || "").trim();
      if (title.length < 2) return sendError(res, 400, "课程名称至少 2 个字");
      course.title = title.slice(0, 80);
    }
    writeDb(db);
    return sendJson(res, 200, { course: courseSummary(course, db) });
  }

  if (req.method === "GET" && pathname === "/api/teacher/dashboard") {
    if (user.role !== "teacher") return sendError(res, 403, "当前账号不是讲师");
    const courses = db.courses.filter((course) => course.teacherId === user.id).map((course) => courseSummary(course, db));
    const responses = db.responses
      .filter((response) => response.teacherId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
    const stats = computeStats(db.responses.filter((response) => response.teacherId === user.id));
    return sendJson(res, 200, { user: publicUser(user), courses, responses, stats });
  }

  if (req.method === "GET" && pathname === "/api/admin/dashboard") {
    if (user.role !== "admin") return sendError(res, 403, "当前账号不是管理员");
    const teachers = db.users.filter((item) => item.role === "teacher").map((teacher) => ({
      ...publicUser(teacher),
      stats: computeStats(db.responses.filter((response) => response.teacherId === teacher.id))
    }));
    const courses = db.courses.map((course) => courseSummary(course, db));
    const responses = db.responses
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((response) => {
        const course = db.courses.find((item) => item.id === response.courseId);
        const teacher = db.users.find((item) => item.id === response.teacherId);
        return {
          ...response,
          courseTitle: course ? course.title : "",
          teacherName: teacher ? teacher.name : "",
          teacherEmail: teacher ? teacher.email : ""
        };
      });
    const stats = computeStats(db.responses);
    return sendJson(res, 200, { user: publicUser(user), teachers, courses, responses, stats });
  }

  if (req.method === "GET" && pathname === "/api/admin/export") {
    if (user.role !== "admin") return sendError(res, 403, "当前账号不是管理员");
    const csv = buildCsv(db);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="performance-survey-${new Date().toISOString().slice(0, 10)}.csv"`
    });
    return res.end(`\uFEFF${csv}`);
  }

  return sendError(res, 404, "接口不存在");
}

function serveStatic(req, res, pathname) {
  let safePath = decodeURIComponent(pathname);
  if (safePath === "/") safePath = "/index.html";

  let filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function getLocalAddresses() {
  const networks = os.networkInterfaces();
  const addresses = [];
  Object.values(networks).forEach((items) => {
    items
      .filter((item) => item.family === "IPv4" && !item.internal)
      .forEach((item) => addresses.push(item.address));
  });
  return addresses;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    send(res, 500, { error: error.message || "服务器错误" });
  }
});

ensureDataFile();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`绩效调研网站已启动: http://localhost:${PORT}`);
  getLocalAddresses().forEach((address) => {
    console.log(`局域网访问: http://${address}:${PORT}`);
  });
});
