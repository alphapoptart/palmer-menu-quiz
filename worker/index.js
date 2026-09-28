const page = "__PALMER_PAGE_HTML__";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const pageHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const allowedOrigins = new Set([
  "https://alphapoptart.github.io",
  "https://palmer-menu-quiz-2026.seansandwich22.chatgpt.site",
  "http://127.0.0.1:8877",
  "http://127.0.0.1:8787",
  "http://localhost:8877",
  "http://localhost:8787",
]);

const allowedMenuFocus = new Set(["mixed", "lunch", "dinner", "missed"]);
const allowedQuestionType = new Set(["all", "ingredients", "prices", "sections", "rules"]);
const allowedRoundLength = new Set(["10", "20", "30", "all"]);

export default {
  async fetch(request, env, ctx) {
    void ctx;

    const url = new URL(request.url);
    if (url.pathname === "/api/scores") {
      if (request.method === "OPTIONS") return corsResponse(request);
      if (request.method === "GET") return listScores(request, env, url);
      if (request.method === "POST") return createScore(request, env);
      return methodNotAllowed(["GET", "POST"]);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed(["GET", "HEAD"]);
    }

    if (url.pathname === "/" || url.pathname === "/scores") {
      return new Response(request.method === "HEAD" ? null : page, { headers: pageHeaders });
    }

    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};

async function listScores(request, env, url) {
  const db = requireDb(env, request);
  if (!db.ok) return db.response;

  const limit = clampNumber(Number(url.searchParams.get("limit") || 100), 10, 250);
  const search = normalizeName(url.searchParams.get("search") || "");
  const filters = search ? [`%${search.toLowerCase()}%`, limit] : [limit];
  const where = search ? "WHERE lower(player_name) LIKE ?" : "";

  const latest = await db.value
    .prepare(`
      SELECT id, player_name, score, total, percent, menu_focus, question_type,
             round_length, missed_count, duration_seconds, created_at
      FROM scores
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(...filters)
    .all();

  const leaderboard = await db.value
    .prepare(`
      SELECT player_name,
             COUNT(*) AS rounds,
             MAX(percent) AS best_percent,
             ROUND(AVG(percent), 1) AS avg_percent,
             MAX(created_at) AS last_played
      FROM scores
      ${where}
      GROUP BY lower(player_name), player_name
      ORDER BY best_percent DESC, avg_percent DESC, rounds DESC, last_played DESC
      LIMIT ?
    `)
    .bind(...filters)
    .all();

  const summaryFilters = search ? [`%${search.toLowerCase()}%`] : [];
  const summary = await db.value
    .prepare(`
      SELECT COUNT(*) AS attempts,
             COUNT(DISTINCT lower(player_name)) AS players,
             ROUND(AVG(percent), 1) AS avg_percent,
             MAX(percent) AS best_percent
      FROM scores
      ${where}
    `)
    .bind(...summaryFilters)
    .first();

  return json({
    summary: {
      attempts: Number(summary?.attempts || 0),
      players: Number(summary?.players || 0),
      avgPercent: Number(summary?.avg_percent || 0),
      bestPercent: Number(summary?.best_percent || 0),
    },
    leaderboard: leaderboard.results || [],
    latest: latest.results || [],
  }, 200, request);
}

async function createScore(request, env) {
  const db = requireDb(env, request);
  if (!db.ok) return db.response;

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20000) return json({ error: "Score payload is too large." }, 413, request);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send score data as JSON." }, 400, request);
  }

  const score = validateScore(body);
  if (!score.ok) return json({ error: score.error }, 400, request);

  const result = await db.value
    .prepare(`
      INSERT INTO scores (
        player_name, score, total, percent, menu_focus, question_type,
        round_length, missed_count, duration_seconds, question_ids, user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, player_name, score, total, percent, menu_focus, question_type,
                round_length, missed_count, duration_seconds, created_at
    `)
    .bind(
      score.value.playerName,
      score.value.score,
      score.value.total,
      score.value.percent,
      score.value.menuFocus,
      score.value.questionType,
      score.value.roundLength,
      score.value.missedCount,
      score.value.durationSeconds,
      JSON.stringify(score.value.questionIds),
      String(request.headers.get("user-agent") || "").slice(0, 240),
    )
    .first();

  return json({ score: result }, 201, request);
}

function requireDb(env, request) {
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return {
      ok: false,
      response: json({ error: "Score storage is unavailable. Try again after deployment finishes." }, 503, request),
    };
  }
  return { ok: true, value: env.DB };
}

function validateScore(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Score payload must be an object." };
  }

  const playerName = normalizeName(body.playerName);
  if (playerName.length < 2) return { ok: false, error: "Enter a server name before starting." };
  if (playerName.length > 60) return { ok: false, error: "Server name must be 60 characters or fewer." };

  const score = integerInRange(body.score, 0, 500);
  const total = integerInRange(body.total, 1, 500);
  if (score == null || total == null || score > total) return { ok: false, error: "Score and total are invalid." };

  const percent = Math.round((score / total) * 100);
  const menuFocus = allowedMenuFocus.has(body.menuFocus) ? body.menuFocus : "mixed";
  const questionType = allowedQuestionType.has(body.questionType) ? body.questionType : "all";
  const roundLength = allowedRoundLength.has(String(body.roundLength)) ? String(body.roundLength) : String(total);
  const missedCount = integerInRange(body.missedCount, 0, 500) ?? 0;
  const durationSeconds = integerInRange(body.durationSeconds, 0, 86400);
  const questionIds = Array.isArray(body.questionIds)
    ? body.questionIds.slice(0, 500).map((id) => String(id).slice(0, 120))
    : [];

  return {
    ok: true,
    value: {
      playerName,
      score,
      total,
      percent,
      menuFocus,
      questionType,
      roundLength,
      missedCount,
      durationSeconds,
      questionIds,
    },
  };
}

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function integerInRange(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function json(body, status = 200, request) {
  const headers = new Headers(jsonHeaders);
  addCorsHeaders(headers, request?.headers?.get("origin"));
  return new Response(JSON.stringify(body), { status, headers });
}

function methodNotAllowed(allowed) {
  return new Response("Method not allowed", {
    status: 405,
    headers: {
      allow: allowed.join(", "),
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function corsResponse(request) {
  const headers = new Headers({
    allow: "GET, POST, OPTIONS",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  });
  addCorsHeaders(headers, request.headers.get("origin"));
  return new Response(null, { status: 204, headers });
}

function addCorsHeaders(headers, origin) {
  if (origin && allowedOrigins.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
}
