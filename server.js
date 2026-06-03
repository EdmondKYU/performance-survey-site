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

const surveyTemplates = {
  course_share: {
    id: "course_share",
    name: "课程分享满意度调研",
    shortName: "课程分享",
    ownerRoleName: "讲师",
    itemName: "课程",
    itemNamePlaceholder: "例如：5 月项目复盘分享",
    itemNoteName: "课程备注",
    itemNotePlaceholder: "可填写分享主题、项目背景或适用对象",
    defaultCategory: "知识分享/项目复盘分享",
    respondentNameLabel: "学员姓名",
    respondentDepartmentLabel: "部门/小组",
    respondentNameFallback: "匿名学员",
    dataSource: "现场学员评",
    achievementLabel: "满意度",
    achievementSuffix: "%",
    maxTotal: 100,
    weight: 0.3,
    weightLabel: "30%",
    trimNote: "样本少于 3 份，暂不剔除最高分和最低分",
    trimmedNote: "已剔除 1 个最高总分和 1 个最低总分",
    belowBand: "满意度不足 77%，此项考核为 0",
    questions: [
      { key: "usefulness", label: "内容实用度", prompt: "听完能用上吗？" },
      { key: "insight", label: "见解深度", prompt: "有没有独到洞察？" },
      { key: "clarity", label: "结构清晰度", prompt: "听得懂、跟得上吗？" },
      { key: "caseQuality", label: "案例质量", prompt: "有真实例支撑吗？" },
      { key: "interaction", label: "互动参与感", prompt: "有参与感还是全程被动？" }
    ],
    bands: [
      { min: 95, max: 100, outMin: 100, outMax: 120, label: "满意度 95% 以上，对应 120-100 分" },
      { min: 89, max: 94, outMin: 85, outMax: 100, label: "满意度 94%-89%，对应 100-85 分" },
      { min: 81, max: 88, outMin: 70, outMax: 84, label: "满意度 88%-81%，对应 84-70 分" },
      { min: 77, max: 80, outMin: 60, outMax: 69, label: "满意度 80%-77%，对应 69-60 分" }
    ]
  },
  cross_department: {
    id: "cross_department",
    name: "跨部门协同满意度调研",
    shortName: "跨部门协同",
    ownerRoleName: "负责人",
    itemName: "协同事项",
    itemNamePlaceholder: "例如：新品上市跨部门协同",
    itemNoteName: "协同说明",
    itemNotePlaceholder: "可填写协同背景、参与部门、交付目标或周期",
    defaultCategory: "跨部门协同",
    respondentNameLabel: "评价人姓名",
    respondentDepartmentLabel: "评价人部门",
    respondentNameFallback: "匿名评价人",
    dataSource: "协作满意度问卷评分",
    achievementLabel: "协作得分",
    achievementSuffix: "",
    maxTotal: 120,
    weight: 0.2,
    weightLabel: "20%",
    trimNote: "样本少于 3 份，暂不剔除最高分和最低分",
    trimmedNote: "已剔除 1 个最高总分和 1 个最低总分",
    belowBand: "低于 60 分，此项考核为 0",
    questions: [
      { key: "requirementClarity", label: "需求清晰度", prompt: "目标、需求与验收口径是否清晰？" },
      { key: "deliveryStandard", label: "交付规范性", prompt: "交付物是否规范、完整、可复用？" },
      { key: "responseSpeed", label: "响应时效性", prompt: "响应是否及时，关键节点是否不拖延？" },
      { key: "collaborationFit", label: "协作配合度", prompt: "跨部门配合是否主动、顺畅？" },
      { key: "communicationEffect", label: "沟通有效性", prompt: "信息传递是否准确、减少反复？" },
      { key: "processControl", label: "过程可控性", prompt: "过程是否有预警、有节奏、有闭环？" }
    ],
    bands: [
      { min: 100, max: 120, outMin: 100, outMax: 120, label: "非常满意，并给予高度评价，对应 120-100 分" },
      { min: 85, max: 99.9, outMin: 85, outMax: 100, label: "满意，基本达到标准，对应 100-85 分" },
      { min: 70, max: 84.9, outMin: 70, outMax: 84, label: "评价尚可，还有进步空间，对应 84-70 分" },
      { min: 60, max: 69.9, outMin: 60, outMax: 69, label: "评价一般，有较大进步空间，对应 69-60 分" }
    ]
  }
};

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
  const shapeChanged = ensureDbShape(db);
  const adminChanged = ensureConfiguredAdmin(db);
  const changed = shapeChanged || adminChanged;
  if (changed) {
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

function ensureDbShape(db) {
  let changed = false;
  if (!Array.isArray(db.users)) {
    db.users = [];
    changed = true;
  }
  if (!Array.isArray(db.courses)) {
    db.courses = [];
    changed = true;
  }
  if (!Array.isArray(db.responses)) {
    db.responses = [];
    changed = true;
  }

  db.courses.forEach((course) => {
    if (!course.templateId) {
      course.templateId = "course_share";
      changed = true;
    }
  });

  db.responses.forEach((response) => {
    if (!response.templateId) {
      const course = db.courses.find((item) => item.id === response.courseId);
      response.templateId = course?.templateId || "course_share";
      changed = true;
    }
  });

  return changed;
}

function getTemplate(templateId) {
  return surveyTemplates[templateId] || surveyTemplates.course_share;
}

function publicTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    shortName: template.shortName,
    ownerRoleName: template.ownerRoleName,
    itemName: template.itemName,
    itemNamePlaceholder: template.itemNamePlaceholder,
    itemNoteName: template.itemNoteName,
    itemNotePlaceholder: template.itemNotePlaceholder,
    defaultCategory: template.defaultCategory,
    respondentNameLabel: template.respondentNameLabel,
    respondentDepartmentLabel: template.respondentDepartmentLabel,
    respondentNameFallback: template.respondentNameFallback,
    dataSource: template.dataSource,
    achievementLabel: template.achievementLabel,
    achievementSuffix: template.achievementSuffix,
    maxTotal: template.maxTotal,
    weight: template.weight,
    weightLabel: template.weightLabel,
    questions: template.questions,
    bands: template.bands,
    belowBand: template.belowBand
  };
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

function destroySessionsForUser(userId) {
  for (const [token, session] of sessions.entries()) {
    if (session.userId === userId) sessions.delete(token);
  }
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

function mapKpiScore(achievement, template) {
  if (achievement === null || achievement === undefined) {
    return { score: null, weightedScore: null, band: "暂无数据" };
  }

  let score = 0;
  let band = template.belowBand;

  for (const item of template.bands) {
    if (achievement >= item.min && achievement <= item.max) {
      score = interpolate(achievement, item.min, item.max, item.outMin, item.outMax);
      band = item.label;
      break;
    }
  }

  const rounded = round(score, 1);
  return {
    score: rounded,
    weightedScore: round(rounded * template.weight, 1),
    band
  };
}

function computeStats(responses, templateInput = "course_share") {
  const template = typeof templateInput === "string" ? getTemplate(templateInput) : templateInput;
  const questionKeys = template.questions.map((question) => question.key);
  const count = responses.length;
  const totals = responses.map((response) => response.total);
  const rawAverage = count ? totals.reduce((sum, total) => sum + total, 0) / count : null;

  let trimmed = responses.slice();
  let trimNote = template.trimNote;
  let removedHigh = null;
  let removedLow = null;

  if (count >= 3) {
    const sorted = responses.slice().sort((a, b) => a.total - b.total || a.createdAt.localeCompare(b.createdAt));
    removedLow = sorted[0];
    removedHigh = sorted[sorted.length - 1];
    trimmed = sorted.slice(1, -1);
    trimNote = template.trimmedNote;
  }

  const trimmedCount = trimmed.length;
  const trimmedAverage = trimmedCount
    ? trimmed.reduce((sum, response) => sum + response.total, 0) / trimmedCount
    : rawAverage;
  const achievement = trimmedAverage === null ? null : trimmedAverage;
  const kpi = mapKpiScore(achievement, template);

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
    satisfaction: round(achievement, 1),
    achievement: round(achievement, 1),
    achievementLabel: template.achievementLabel,
    achievementSuffix: template.achievementSuffix,
    maxTotal: template.maxTotal,
    weightLabel: template.weightLabel,
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
  const template = getTemplate(course.templateId);
  return {
    ...course,
    template: publicTemplate(template),
    teacherName: teacher ? teacher.name : "未知讲师",
    teacherEmail: teacher ? teacher.email : "",
    stats: computeStats(responses, template)
  };
}

function templateStats(db, responses) {
  return Object.values(surveyTemplates).map((template) => {
    const scoped = responses.filter((response) => {
      if (response.templateId) return response.templateId === template.id;
      const course = db.courses.find((item) => item.id === response.courseId);
      return (course?.templateId || "course_share") === template.id;
    });
    return {
      template: publicTemplate(template),
      stats: computeStats(scoped, template)
    };
  });
}

function validateScores(scores, template) {
  if (!scores || typeof scores !== "object") return null;

  const clean = {};
  for (const key of template.questions.map((question) => question.key)) {
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
    "问卷模板",
    "负责人",
    "负责人邮箱",
    "问卷事项",
    "评价人",
    "部门",
    "维度得分明细",
    "总分",
    "满分",
    "建议"
  ];

  const rows = db.responses.map((response) => {
    const course = db.courses.find((item) => item.id === response.courseId);
    const teacher = db.users.find((item) => item.id === response.teacherId);
    const template = getTemplate(response.templateId || course?.templateId);
    const scoreText = template.questions
      .map((question) => `${question.label}:${response.scores?.[question.key] ?? ""}/20`)
      .join("；");
    return [
      response.createdAt,
      template.name,
      teacher ? teacher.name : "",
      teacher ? teacher.email : "",
      course ? course.title : "",
      response.participantName || template.respondentNameFallback,
      response.department || "",
      scoreText,
      response.total,
      template.maxTotal,
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

  if (req.method === "GET" && pathname === "/api/templates") {
    return sendJson(res, 200, { templates: Object.values(surveyTemplates).map(publicTemplate) });
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (name.length < 2) return sendError(res, 400, "请填写负责人姓名");
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
    if (!course) return sendError(res, 404, "问卷不存在");
    const teacher = db.users.find((item) => item.id === course.teacherId);
    const template = getTemplate(course.templateId);
    return sendJson(res, 200, {
      course: {
        id: course.id,
        title: course.title,
        templateId: template.id,
        category: course.category,
        scheduledAt: course.scheduledAt,
        description: course.description,
        active: course.active
      },
      template: publicTemplate(template),
      teacher: teacher ? { id: teacher.id, name: teacher.name } : null
    });
  }

  const responseMatch = pathname.match(/^\/api\/public\/courses\/([^/]+)\/responses$/);
  if (req.method === "POST" && responseMatch) {
    const course = db.courses.find((item) => item.id === responseMatch[1]);
    if (!course) return sendError(res, 404, "问卷不存在");
    if (!course.active) return sendError(res, 403, "该问卷已关闭");

    const body = await readBody(req);
    const template = getTemplate(course.templateId);
    const scores = validateScores(body.scores, template);
    if (!scores) return sendError(res, 400, "评分必须在 0-20 分之间");

    const total = template.questions.reduce((sum, question) => sum + scores[question.key], 0);
    const response = {
      id: makeId("resp"),
      courseId: course.id,
      teacherId: course.teacherId,
      templateId: template.id,
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
    if (user.role !== "teacher") return sendError(res, 403, "只有负责人可以创建问卷");
    const body = await readBody(req);
    const title = String(body.title || "").trim();
    const template = getTemplate(body.templateId);
    if (title.length < 2) return sendError(res, 400, "请填写问卷事项");

    const course = {
      id: makeId("course"),
      teacherId: user.id,
      templateId: template.id,
      title: title.slice(0, 80),
      category: String(body.category || template.defaultCategory).trim().slice(0, 60),
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
    if (!course) return sendError(res, 404, "问卷不存在");
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
      if (title.length < 2) return sendError(res, 400, "问卷事项至少 2 个字");
      course.title = title.slice(0, 80);
    }
    writeDb(db);
    return sendJson(res, 200, { course: courseSummary(course, db) });
  }

  if (req.method === "GET" && pathname === "/api/teacher/dashboard") {
    if (user.role !== "teacher") return sendError(res, 403, "当前账号不是负责人");
    const courses = db.courses.filter((course) => course.teacherId === user.id).map((course) => courseSummary(course, db));
    const responses = db.responses
      .filter((response) => response.teacherId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
    const allResponses = db.responses.filter((response) => response.teacherId === user.id);
    const stats = computeStats(allResponses.filter((response) => (response.templateId || "course_share") === "course_share"));
    return sendJson(res, 200, {
      user: publicUser(user),
      templates: Object.values(surveyTemplates).map(publicTemplate),
      courses,
      responses,
      stats,
      templateStats: templateStats(db, allResponses)
    });
  }

  if (req.method === "GET" && pathname === "/api/admin/dashboard") {
    if (user.role !== "admin") return sendError(res, 403, "当前账号不是管理员");
    const teachers = db.users.filter((item) => item.role === "teacher").map((teacher) => ({
      ...publicUser(teacher),
      stats: computeStats(db.responses.filter((response) => response.teacherId === teacher.id && (response.templateId || "course_share") === "course_share")),
      templateStats: templateStats(db, db.responses.filter((response) => response.teacherId === teacher.id))
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
          templateId: response.templateId || course?.templateId || "course_share",
          templateName: getTemplate(response.templateId || course?.templateId).shortName,
          courseTitle: course ? course.title : "",
          teacherName: teacher ? teacher.name : "",
          teacherEmail: teacher ? teacher.email : ""
        };
      });
    const stats = computeStats(db.responses.filter((response) => (response.templateId || "course_share") === "course_share"));
    return sendJson(res, 200, {
      user: publicUser(user),
      templates: Object.values(surveyTemplates).map(publicTemplate),
      teachers,
      courses,
      responses,
      stats,
      templateStats: templateStats(db, db.responses)
    });
  }

  const resetPasswordMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
  if (req.method === "POST" && resetPasswordMatch) {
    if (user.role !== "admin") return sendError(res, 403, "当前账号不是管理员");

    const targetUser = db.users.find((item) => item.id === resetPasswordMatch[1]);
    if (!targetUser) return sendError(res, 404, "账号不存在");
    if (targetUser.role === "admin") return sendError(res, 403, "管理员密码请通过环境变量修改");

    const body = await readBody(req);
    const newPassword = String(body.password || "");
    if (newPassword.length < 6) return sendError(res, 400, "新密码至少 6 位");

    targetUser.password = hashPassword(newPassword);
    targetUser.passwordResetAt = nowIso();
    targetUser.passwordResetBy = user.id;
    writeDb(db);
    destroySessionsForUser(targetUser.id);

    return sendJson(res, 200, { user: publicUser(targetUser), ok: true });
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
