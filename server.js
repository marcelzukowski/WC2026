const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { matches, TEAM_NAMES, TEAM_FLAG_CODES } = require("./data/seed");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const IS_VERCEL = Boolean(process.env.VERCEL);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function nowIso() {
  return new Date().toISOString();
}

function createInitialDb() {
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const admin = createUserRecord(adminUsername, adminPassword, "admin");

  return {
    users: [admin],
    sessions: [],
    matches,
    predictions: [],
    results: [],
    groupTieBreaks: {},
    knockoutSlotOverrides: {},
    settings: {
      hidePredictionsUntilKickoff: true
    }
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) return;
  writeLocalDb(createInitialDb());
}

async function readDb() {
  if (IS_VERCEL && !USE_SUPABASE) {
    throw new Error("Brakuje zmiennych SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w Vercel.");
  }
  if (USE_SUPABASE) return readSupabaseDb();
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (syncSeedMatches(db)) await writeDb(db);
  return db;
}

async function writeDb(db) {
  if (USE_SUPABASE) return writeSupabaseDb(db);
  writeLocalDb(db);
}

function writeLocalDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase error ${response.status}: ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function readSupabaseDb() {
  const rows = await supabaseRequest("app_state?id=eq.main&select=data");
  if (rows[0]?.data) {
    const db = rows[0].data;
    if (syncSeedMatches(db)) await writeSupabaseDb(db);
    return db;
  }
  const db = createInitialDb();
  await supabaseRequest("app_state", {
    method: "POST",
    body: JSON.stringify({ id: "main", data: db })
  });
  return db;
}

async function writeSupabaseDb(db) {
  await supabaseRequest("app_state?id=eq.main", {
    method: "PATCH",
    body: JSON.stringify({ data: db, updated_at: nowIso() })
  });
}

function syncSeedMatches(db) {
  let changed = false;
  if (!Array.isArray(db.users)) {
    db.users = [];
    changed = true;
  }
  if (!Array.isArray(db.sessions)) {
    db.sessions = [];
    changed = true;
  }
  if (!Array.isArray(db.predictions)) {
    db.predictions = [];
    changed = true;
  }
  if (!Array.isArray(db.results)) {
    db.results = [];
    changed = true;
  }
  if (!db.settings) {
    db.settings = { hidePredictionsUntilKickoff: true };
    changed = true;
  }
  if (!db.groupTieBreaks) {
    db.groupTieBreaks = {};
    changed = true;
  }
  if (!db.knockoutSlotOverrides) {
    db.knockoutSlotOverrides = {};
    changed = true;
  }
  const currentById = new Map((db.matches || []).map((match) => [match.id, match]));
  db.matches = matches.map((seedMatch) => {
    const current = currentById.get(seedMatch.id);
    if (!current) {
      changed = true;
      return seedMatch;
    }
    const merged = { ...current, ...seedMatch };
    if (JSON.stringify(current) !== JSON.stringify(merged)) changed = true;
    return merged;
  });
  return changed;
}

function createUserRecord(username, password, role = "user") {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return {
    id: crypto.randomUUID(),
    username,
    role,
    salt,
    passwordHash: hash,
    createdAt: nowIso()
  };
}

function verifyPassword(user, password) {
  const hash = crypto.scryptSync(password, user.salt, 64);
  const stored = Buffer.from(user.passwordHash, "hex");
  return stored.length === hash.length && crypto.timingSafeEqual(stored, hash);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((cookie) => {
    const [key, ...value] = cookie.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function getSessionUser(req, db) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token);
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}

function isStarted(match) {
  return new Date(match.kickoff).getTime() <= Date.now();
}

function isLocked(match) {
  return isStarted(match);
}

function resultKind(home, away) {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function normalizePrediction(match, payload) {
  const homeGoals = Number(payload.homeGoals);
  const awayGoals = Number(payload.awayGoals);
  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals) || homeGoals < 0 || awayGoals < 0 || homeGoals > 30 || awayGoals > 30) {
    throw new Error("Podaj poprawny wynik.");
  }
  let advancingTeam = null;
  if (match.stage !== "group") {
    if (homeGoals > awayGoals) advancingTeam = "home";
    if (awayGoals > homeGoals) advancingTeam = "away";
    if (homeGoals === awayGoals) {
      if (!["home", "away"].includes(payload.advancingTeam)) throw new Error("Przy remisie wskaż drużynę awansującą.");
      advancingTeam = payload.advancingTeam;
    }
  }
  return { homeGoals, awayGoals, advancingTeam };
}

function scorePrediction(match, prediction, result) {
  if (!prediction || !result) return 0;
  let points = 0;
  const exact = prediction.homeGoals === result.homeGoals && prediction.awayGoals === result.awayGoals;
  const sameResult = resultKind(prediction.homeGoals, prediction.awayGoals) === resultKind(result.homeGoals, result.awayGoals);
  if (exact) points += 5;
  else if (sameResult) points += 3;
  if (match.stage !== "group" && prediction.advancingTeam && prediction.advancingTeam === result.advancingTeam) points += 2;
  return points;
}

function teamFromCode(code) {
  return {
    code,
    name: TEAM_NAMES[code] || code,
    flagCode: TEAM_FLAG_CODES[code] || null
  };
}

function getResult(db, matchId) {
  return db.results.find((item) => item.matchId === matchId) || null;
}

function buildGroupStandings(db) {
  const output = {};
  const groupMatches = db.matches.filter((match) => match.stage === "group");
  const groups = [...new Set(groupMatches.map((match) => match.group))].sort();

  for (const group of groups) {
    const matchesInGroup = groupMatches.filter((match) => match.group === group);
    const teamCodes = [...new Set(matchesInGroup.flatMap((match) => [match.homeCode, match.awayCode]))];
    const table = new Map(teamCodes.map((code) => [code, {
      ...teamFromCode(code),
      group,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      needsAdminTieBreak: false
    }]));

    for (const match of matchesInGroup) {
      const result = getResult(db, match.id);
      if (!result) continue;
      const home = table.get(match.homeCode);
      const away = table.get(match.awayCode);
      home.played += 1;
      away.played += 1;
      home.goalsFor += result.homeGoals;
      home.goalsAgainst += result.awayGoals;
      away.goalsFor += result.awayGoals;
      away.goalsAgainst += result.homeGoals;
      if (result.homeGoals > result.awayGoals) {
        home.won += 1;
        away.lost += 1;
        home.points += 3;
      } else if (result.awayGoals > result.homeGoals) {
        away.won += 1;
        home.lost += 1;
        away.points += 3;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    }

    for (const item of table.values()) {
      item.goalDifference = item.goalsFor - item.goalsAgainst;
    }

    const completed = matchesInGroup.every((match) => getResult(db, match.id));
    const rows = [...table.values()];
    const manualOrder = db.groupTieBreaks?.[group] || [];
    rows.sort((a, b) => compareGroupRows(db, matchesInGroup, rows, manualOrder, a, b));
    rows.forEach((row, index) => {
      row.position = index + 1;
      row.needsAdminTieBreak = completed && hasUnresolvedDisciplinaryTie(db, matchesInGroup, rows, manualOrder, row);
    });
    output[group] = { group, completed, rows };
  }

  return output;
}

function compareGroupRows(db, matchesInGroup, rows, manualOrder, a, b) {
  if (b.points !== a.points) return b.points - a.points;
  const tiedCodes = rows.filter((row) => row.points === a.points).map((row) => row.code);
  const h2hA = headToHeadStats(db, matchesInGroup, a.code, tiedCodes);
  const h2hB = headToHeadStats(db, matchesInGroup, b.code, tiedCodes);
  if (h2hB.points !== h2hA.points) return h2hB.points - h2hA.points;
  if (h2hB.goalDifference !== h2hA.goalDifference) return h2hB.goalDifference - h2hA.goalDifference;
  if (h2hB.goalsFor !== h2hA.goalsFor) return h2hB.goalsFor - h2hA.goalsFor;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  const manualA = manualOrder.indexOf(a.code);
  const manualB = manualOrder.indexOf(b.code);
  if (manualA !== -1 || manualB !== -1) {
    if (manualA === -1) return 1;
    if (manualB === -1) return -1;
    return manualA - manualB;
  }
  return a.name.localeCompare(b.name, "pl");
}

function headToHeadStats(db, matchesInGroup, code, tiedCodes) {
  const stats = { points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
  for (const match of matchesInGroup) {
    if (!tiedCodes.includes(match.homeCode) || !tiedCodes.includes(match.awayCode)) continue;
    if (match.homeCode !== code && match.awayCode !== code) continue;
    const result = getResult(db, match.id);
    if (!result) continue;
    const ownGoals = match.homeCode === code ? result.homeGoals : result.awayGoals;
    const againstGoals = match.homeCode === code ? result.awayGoals : result.homeGoals;
    stats.goalsFor += ownGoals;
    stats.goalsAgainst += againstGoals;
    if (ownGoals > againstGoals) stats.points += 3;
    else if (ownGoals === againstGoals) stats.points += 1;
  }
  stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
  return stats;
}

function hasUnresolvedDisciplinaryTie(db, matchesInGroup, rows, manualOrder, row) {
  return rows.some((other) => {
    if (other.code === row.code || other.points !== row.points) return false;
    const tiedCodes = rows.filter((candidate) => candidate.points === row.points).map((candidate) => candidate.code);
    const h2hRow = headToHeadStats(db, matchesInGroup, row.code, tiedCodes);
    const h2hOther = headToHeadStats(db, matchesInGroup, other.code, tiedCodes);
    const stillTied = h2hRow.points === h2hOther.points
      && h2hRow.goalDifference === h2hOther.goalDifference
      && h2hRow.goalsFor === h2hOther.goalsFor
      && row.goalDifference === other.goalDifference
      && row.goalsFor === other.goalsFor;
    return stillTied && (!manualOrder.includes(row.code) || !manualOrder.includes(other.code));
  });
}

function buildResolvedMatches(db, groupStandings = buildGroupStandings(db)) {
  const resolved = new Map();
  return db.matches.map((match) => resolveMatch(db, match.id, resolved, groupStandings));
}

function resolveMatch(db, matchId, resolved, groupStandings) {
  if (resolved.has(matchId)) return resolved.get(matchId);
  const match = db.matches.find((item) => item.id === matchId);
  if (!match) return null;
  const next = { ...match };
  const home = resolveSlot(db, match.homeCode, match.id, "home", resolved, groupStandings);
  const away = resolveSlot(db, match.awayCode, match.id, "away", resolved, groupStandings);
  Object.assign(next, {
    homeOriginalCode: match.homeCode,
    awayOriginalCode: match.awayCode,
    homeCode: home.code,
    awayCode: away.code,
    homeTeam: home.name,
    awayTeam: away.name,
    homeFlagCode: home.flagCode,
    awayFlagCode: away.flagCode,
    homeResolved: home.resolved,
    awayResolved: away.resolved
  });
  resolved.set(matchId, next);
  return next;
}

function resolveSlot(db, slot, matchId, side, resolved, groupStandings) {
  if (TEAM_NAMES[slot]) return { ...teamFromCode(slot), resolved: true };

  const positionMatch = String(slot).match(/^([12])([A-L])$/);
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    const group = positionMatch[2];
    const standings = groupStandings[group];
    if (standings?.completed) {
      const row = standings.rows[position - 1];
      if (row) return { ...teamFromCode(row.code), resolved: true };
    }
  }

  if (/^3\s?[A-L]+$/.test(String(slot))) {
    const override = db.knockoutSlotOverrides?.[`${matchId}:${side}`];
    if (override && TEAM_NAMES[override]) return { ...teamFromCode(override), resolved: true };
  }

  const winnerMatch = String(slot).match(/^W(\d+)$/);
  if (winnerMatch) {
    const source = resolveMatch(db, Number(winnerMatch[1]), resolved, groupStandings);
    const result = source ? getResult(db, source.id) : null;
    if (source && result?.advancingTeam) {
      const sourceSide = result.advancingTeam;
      return {
        code: sourceSide === "home" ? source.homeCode : source.awayCode,
        name: sourceSide === "home" ? source.homeTeam : source.awayTeam,
        flagCode: sourceSide === "home" ? source.homeFlagCode : source.awayFlagCode,
        resolved: sourceSide === "home" ? source.homeResolved : source.awayResolved
      };
    }
  }

  const loserMatch = String(slot).match(/^Przegrany (\d+)$/);
  if (loserMatch) {
    const source = resolveMatch(db, Number(loserMatch[1]), resolved, groupStandings);
    const result = source ? getResult(db, source.id) : null;
    if (source && result?.advancingTeam) {
      const sourceSide = result.advancingTeam === "home" ? "away" : "home";
      return {
        code: sourceSide === "home" ? source.homeCode : source.awayCode,
        name: sourceSide === "home" ? source.homeTeam : source.awayTeam,
        flagCode: sourceSide === "home" ? source.homeFlagCode : source.awayFlagCode,
        resolved: sourceSide === "home" ? source.homeResolved : source.awayResolved
      };
    }
  }

  return { code: slot, name: slot, flagCode: null, resolved: false };
}

function thirdPlaceCandidates(groupStandings) {
  return Object.values(groupStandings)
    .filter((standing) => standing.completed && standing.rows[2])
    .map((standing) => standing.rows[2])
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name, "pl"));
}

function decorateMatch(db, match, user) {
  const prediction = user ? db.predictions.find((item) => item.userId === user.id && item.matchId === match.id) : null;
  const result = db.results.find((item) => item.matchId === match.id) || null;
  const stats = isStarted(match) ? getMatchStats(db, match.id) : null;
  return {
    ...match,
    locked: isLocked(match),
    started: isStarted(match),
    prediction,
    result,
    points: user ? scorePrediction(match, prediction, result) : 0,
    stats
  };
}

function buildRanking(db) {
  return db.users
    .filter((user) => user.role !== "admin")
    .map((user) => {
      const points = db.matches.reduce((sum, match) => {
        const prediction = db.predictions.find((item) => item.userId === user.id && item.matchId === match.id);
        const result = db.results.find((item) => item.matchId === match.id);
        return sum + scorePrediction(match, prediction, result);
      }, 0);
      const predictionsCount = db.predictions.filter((item) => item.userId === user.id).length;
      return { id: user.id, username: user.username, points, predictionsCount };
    })
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username, "pl"))
    .map((user, index) => ({ ...user, place: index + 1 }));
}

function getMatchStats(db, matchId) {
  const predictions = db.predictions.filter((item) => item.matchId === matchId);
  return predictions.reduce((stats, prediction) => {
    stats.total += 1;
    stats[resultKind(prediction.homeGoals, prediction.awayGoals)] += 1;
    return stats;
  }, { total: 0, home: 0, draw: 0, away: 0 });
}

function cleanSessions(db) {
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  return db.sessions.length !== before;
}

async function handleApi(req, res, pathname) {
  try {
    const db = await readDb();
    if (cleanSessions(db)) await writeDb(db);
    const user = getSessionUser(req, db);

    if (req.method === "POST" && pathname === "/api/register") {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (username.length < 3 || username.length > 30) return sendJson(res, 400, { error: "Nazwa użytkownika musi mieć od 3 do 30 znaków." });
      if (password.length < 4) return sendJson(res, 400, { error: "Hasło musi mieć co najmniej 4 znaki." });
      if (db.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) return sendJson(res, 409, { error: "Ta nazwa użytkownika jest już zajęta." });
      const nextUser = createUserRecord(username, password, "user");
      db.users.push(nextUser);
      const token = createSession(db, nextUser.id);
      await writeDb(db);
      return sendJson(res, 201, { user: publicUser(nextUser) }, sessionHeader(token));
    }

    if (req.method === "POST" && pathname === "/api/login") {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const found = db.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
      if (!found || !verifyPassword(found, password)) return sendJson(res, 401, { error: "Nieprawidłowy login lub hasło." });
      const token = createSession(db, found.id);
      await writeDb(db);
      return sendJson(res, 200, { user: publicUser(found) }, sessionHeader(token));
    }

    if (req.method === "POST" && pathname === "/api/logout") {
      const token = parseCookies(req).session;
      db.sessions = db.sessions.filter((session) => session.token !== token);
      await writeDb(db);
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
    }

    if (req.method === "GET" && pathname === "/api/me") {
      return sendJson(res, 200, { user: user ? publicUser(user) : null });
    }

    if (!user) return sendJson(res, 401, { error: "Musisz się zalogować." });

    if (req.method === "GET" && pathname === "/api/bootstrap") {
      const groupStandings = buildGroupStandings(db);
      const resolvedMatches = buildResolvedMatches(db, groupStandings);
      const ranking = buildRanking(db);
      const decorated = resolvedMatches.map((match) => decorateMatch(db, match, user));
      return sendJson(res, 200, {
        user: publicUser(user),
        settings: db.settings,
        matches: decorated,
        groupStandings,
        thirdPlaceCandidates: thirdPlaceCandidates(groupStandings),
        knockoutSlotOverrides: db.knockoutSlotOverrides,
        groupTieBreaks: db.groupTieBreaks,
        ranking,
        users: db.users.filter((item) => item.role !== "admin").map(publicUser)
      });
    }

    if (req.method === "POST" && pathname === "/api/predictions") {
      if (user.role === "admin") return sendJson(res, 403, { error: "Administrator nie bierze udziału w typowaniu." });
      const body = await readBody(req);
      const match = buildResolvedMatches(db).find((item) => item.id === Number(body.matchId));
      if (!match) return sendJson(res, 404, { error: "Nie znaleziono meczu." });
      if (isLocked(match)) return sendJson(res, 409, { error: "Typowanie tego meczu jest już zablokowane." });
      if (db.predictions.some((item) => item.userId === user.id && item.matchId === match.id)) return sendJson(res, 409, { error: "Ten mecz został już wytypowany." });
      const normalized = normalizePrediction(match, body);
      db.predictions.push({ userId: user.id, matchId: match.id, ...normalized, createdAt: nowIso() });
      await writeDb(db);
      return sendJson(res, 201, { match: decorateMatch(db, match, user), ranking: buildRanking(db) });
    }

    if (req.method === "POST" && pathname === "/api/admin/results") {
      if (user.role !== "admin") return sendJson(res, 403, { error: "Brak uprawnień administratora." });
      const body = await readBody(req);
      const match = buildResolvedMatches(db).find((item) => item.id === Number(body.matchId));
      if (!match) return sendJson(res, 404, { error: "Nie znaleziono meczu." });
      const normalized = normalizePrediction(match, body);
      const existing = db.results.find((item) => item.matchId === match.id);
      if (existing) Object.assign(existing, normalized, { updatedAt: nowIso() });
      else db.results.push({ matchId: match.id, ...normalized, createdAt: nowIso(), updatedAt: nowIso() });
      await writeDb(db);
      return sendJson(res, 200, { match: decorateMatch(db, match, user), ranking: buildRanking(db) });
    }

    if (req.method === "POST" && pathname === "/api/admin/predictions") {
      if (user.role !== "admin") return sendJson(res, 403, { error: "Brak uprawnień administratora." });
      const body = await readBody(req);
      const targetUser = db.users.find((item) => item.id === String(body.userId) && item.role !== "admin");
      if (!targetUser) return sendJson(res, 404, { error: "Nie znaleziono uczestnika." });
      const match = buildResolvedMatches(db).find((item) => item.id === Number(body.matchId));
      if (!match) return sendJson(res, 404, { error: "Nie znaleziono meczu." });
      const normalized = normalizePrediction(match, body);
      const existing = db.predictions.find((item) => item.userId === targetUser.id && item.matchId === match.id);
      if (existing) Object.assign(existing, normalized, { updatedAt: nowIso(), updatedByAdmin: user.id });
      else db.predictions.push({ userId: targetUser.id, matchId: match.id, ...normalized, createdAt: nowIso(), updatedByAdmin: user.id });
      await writeDb(db);
      return sendJson(res, 200, { match: decorateMatch(db, match, user), ranking: buildRanking(db) });
    }

    if (req.method === "POST" && pathname === "/api/admin/group-tiebreaks") {
      if (user.role !== "admin") return sendJson(res, 403, { error: "Brak uprawnień administratora." });
      const body = await readBody(req);
      const group = String(body.group || "").toUpperCase();
      if (!/^[A-L]$/.test(group)) return sendJson(res, 400, { error: "Nieprawidłowa grupa." });
      const order = Array.isArray(body.order) ? body.order.filter((code) => TEAM_NAMES[code]) : [];
      db.groupTieBreaks[group] = [...new Set(order)];
      await writeDb(db);
      return sendJson(res, 200, { groupTieBreaks: db.groupTieBreaks });
    }

    if (req.method === "POST" && pathname === "/api/admin/knockout-slots") {
      if (user.role !== "admin") return sendJson(res, 403, { error: "Brak uprawnień administratora." });
      const body = await readBody(req);
      const matchId = Number(body.matchId);
      const side = String(body.side || "");
      const teamCode = String(body.teamCode || "");
      const match = db.matches.find((item) => item.id === matchId && item.stage === "knockout");
      if (!match || !["home", "away"].includes(side)) return sendJson(res, 400, { error: "Nieprawidłowy slot drabinki." });
      if (!TEAM_NAMES[teamCode]) return sendJson(res, 400, { error: "Wybierz prawidłową drużynę." });
      db.knockoutSlotOverrides[`${matchId}:${side}`] = teamCode;
      await writeDb(db);
      return sendJson(res, 200, { knockoutSlotOverrides: db.knockoutSlotOverrides });
    }

    if (req.method === "POST" && pathname === "/api/admin/settings") {
      if (user.role !== "admin") return sendJson(res, 403, { error: "Brak uprawnień administratora." });
      const body = await readBody(req);
      db.settings.hidePredictionsUntilKickoff = Boolean(body.hidePredictionsUntilKickoff);
      await writeDb(db);
      return sendJson(res, 200, { settings: db.settings });
    }

    const profileMatch = pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
    if (req.method === "GET" && profileMatch) {
      const resolvedMatches = buildResolvedMatches(db);
      const profileUser = db.users.find((item) => item.id === profileMatch[1] && item.role !== "admin");
      if (!profileUser) return sendJson(res, 404, { error: "Nie znaleziono użytkownika." });
      const profilePredictions = db.predictions
        .filter((item) => item.userId === profileUser.id)
        .map((prediction) => {
          const match = resolvedMatches.find((item) => item.id === prediction.matchId);
          const result = db.results.find((item) => item.matchId === match.id) || null;
          if (db.settings.hidePredictionsUntilKickoff && !isStarted(match) && !result && profileUser.id !== user.id) {
            return null;
          }
          return { match, prediction, result, points: scorePrediction(match, prediction, result) };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(a.match.kickoff) - new Date(b.match.kickoff));
      const ranking = buildRanking(db).find((item) => item.id === profileUser.id);
      return sendJson(res, 200, { user: publicUser(profileUser), ranking, predictions: profilePredictions });
    }

    return sendJson(res, 404, { error: "Nie znaleziono endpointu." });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "Nie udało się obsłużyć żądania." });
  }
}

function handleRequest(req, res) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url.pathname);
    return;
  }
  serveStatic(req, res, url.pathname);
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions.push({ token, userId, createdAt: nowIso(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
  return token;
}

function sessionHeader(token) {
  return {
    "Set-Cookie": `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  };
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
        res.end(fallback);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

if (!USE_SUPABASE) ensureDb();

if (require.main === module) {
  http.createServer(handleRequest).listen(PORT, () => {
    console.log(`WC2026 Typer działa: http://localhost:${PORT}`);
  });
}

module.exports = { handleRequest };
