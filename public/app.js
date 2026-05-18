const app = document.querySelector("#app");
const state = {
  user: null,
  matches: [],
  ranking: [],
  users: [],
  settings: {},
  groupStandings: {},
  thirdPlaceCandidates: [],
  knockoutSlotOverrides: {},
  groupTieBreaks: {},
  view: "home",
  group: "A",
  sortRanking: "place",
  message: "",
  error: "",
  profile: null
};

const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const knockoutRounds = ["R1/16", "1/8", "1/4", "1/2", "Mecz o 3. miejsce", "Finał"];

function plDate(iso) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw"
  }).format(new Date(iso));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Wystąpił błąd.");
  return data;
}

async function init() {
  const me = await api("/api/me");
  if (!me.user) return renderAuth();
  await loadBootstrap();
}

async function loadBootstrap() {
  const data = await api("/api/bootstrap");
  Object.assign(state, data, { error: "" });
  renderApp();
}

function renderAuth(mode = "login") {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-hero">
        <h1>Typer MŚ 2026</h1>
        <p>Typuj mecze, sprawdzaj punkty i podglądaj wybory innych uczestników dopiero po pierwszym gwizdku.</p>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <h2>${mode === "login" ? "Logowanie" : "Rejestracja"}</h2>
          <p class="muted">${mode === "login" ? "Konto demo: ania / test123. Administrator: admin / admin123." : "Rejestracja jest otwarta dla wszystkich."}</p>
          <form id="auth-form" class="grid">
            <input name="username" placeholder="Nazwa użytkownika" autocomplete="username" required>
            <input name="password" placeholder="Hasło" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required>
            <button class="primary full" type="submit">${mode === "login" ? "Zaloguj" : "Utwórz konto"}</button>
          </form>
          <button class="ghost full" id="switch-auth" style="margin-top:10px">${mode === "login" ? "Nie mam konta" : "Mam już konto"}</button>
          <div id="auth-error"></div>
        </div>
      </section>
    </main>
  `;
  document.querySelector("#switch-auth").addEventListener("click", () => renderAuth(mode === "login" ? "register" : "login"));
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api(mode === "login" ? "/api/login" : "/api/register", {
        method: "POST",
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") })
      });
      await loadBootstrap();
    } catch (error) {
      document.querySelector("#auth-error").innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    }
  });
}

function renderApp() {
  app.innerHTML = `
    <main class="app-shell">
      <aside class="sidebar">
        <div class="brand">MŚ 2026</div>
        <nav class="nav">
          ${navButton("home", "Start")}
          ${navButton("group", "Faza grupowa")}
          ${navButton("knockout", "Faza pucharowa")}
          ${navButton("ranking", "Ranking")}
          ${navButton("my", "Moje typy")}
          ${state.user.role === "admin" ? navButton("admin", "Panel admina") : ""}
        </nav>
        <div class="sidebar-footer">
          <div><strong>${escapeHtml(state.user.username)}</strong></div>
          <div class="muted">${state.user.role === "admin" ? "administrator" : "uczestnik"}</div>
          <button class="ghost full" id="logout" style="margin-top:12px">Wyloguj</button>
        </div>
      </aside>
      <section class="content">
        ${renderHeader()}
        ${state.message ? `<div class="success">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
        ${renderView()}
      </section>
    </main>
  `;
  bindCommon();
}

function navButton(view, label) {
  return `<button data-view="${view}" class="${state.view === view ? "active" : ""}">${label}</button>`;
}

function renderHeader() {
  const titles = {
    home: ["Panel główny", "Najbliższe mecze, ostatnie wyniki i czołówka rankingu."],
    group: ["Faza grupowa", "Wszystkie mecze podzielone według grup."],
    knockout: ["Faza pucharowa", "Klasyczna drabinka i typowanie drużyny awansującej."],
    ranking: ["Ranking", "Pełna tabela uczestników bez konta administratora."],
    my: ["Moje typy", "Historia zapisanych typów i zdobytych punktów."],
    admin: ["Panel admina", "Ręczne wpisywanie i poprawianie wyników meczów."]
  };
  const [title, subtitle] = titles[state.view] || titles.home;
  return `
    <div class="topbar">
      <div>
        <h2>${title}</h2>
        <div class="muted">${subtitle}</div>
      </div>
      <span class="badge gold">Czas: Polska</span>
    </div>
  `;
}

function renderView() {
  if (state.view === "group") return renderGroup();
  if (state.view === "knockout") return renderKnockout();
  if (state.view === "ranking") return renderRanking();
  if (state.view === "my") return renderMyProfile();
  if (state.view === "admin") return renderAdmin();
  return renderHome();
}

function renderHome() {
  const now = Date.now();
  const twoDays = 1000 * 60 * 60 * 24 * 2;
  const upcoming = state.matches
    .filter((match) => new Date(match.kickoff).getTime() >= now && new Date(match.kickoff).getTime() <= now + twoDays)
    .sort(byKickoff);
  const recent = state.matches
    .filter((match) => new Date(match.kickoff).getTime() < now && new Date(match.kickoff).getTime() >= now - twoDays)
    .sort(byKickoff);

  return `
    <div class="grid two">
      <section class="panel">
        <h3>TOP 10</h3>
        <div class="match-list">${state.ranking.slice(0, 10).map(renderRankingCard).join("") || empty("Brak uczestników.")}</div>
      </section>
      <section class="panel">
        <h3>Najbliższe 2 dni</h3>
        <div class="match-list">${upcoming.map(renderMatchCard).join("") || empty("Brak meczów w tym oknie czasowym.")}</div>
      </section>
    </div>
    <section class="panel" style="margin-top:18px">
      <h3>Poprzednie 2 dni</h3>
      <div class="match-list">${recent.map(renderMatchCard).join("") || empty("Brak rozegranych meczów w tym oknie czasowym.")}</div>
    </section>
  `;
}

function renderGroup() {
  const matches = state.matches.filter((match) => match.stage === "group" && match.group === state.group).sort(byKickoff);
  return `
    <div class="tabs">${groups.map((group) => `<button class="${state.group === group ? "active" : ""}" data-group="${group}">Grupa ${group}</button>`).join("")}</div>
    ${renderGroupTable(state.group)}
    <div class="match-list">${matches.map(renderMatchCard).join("")}</div>
  `;
}

function renderGroupTable(group) {
  const standing = state.groupStandings?.[group];
  if (!standing) return "";
  return `
    <section class="panel" style="margin-bottom:18px">
      <div class="topbar" style="margin-bottom:8px">
        <h3>Tabela grupy ${group}</h3>
        <span class="badge ${standing.completed ? "gold" : ""}">${standing.completed ? "komplet wyników" : "w trakcie"}</span>
      </div>
      <table>
        <thead><tr><th>#</th><th>Drużyna</th><th>M</th><th>PKT</th><th>Bramki</th><th>Bilans</th></tr></thead>
        <tbody>
          ${standing.rows.map((row) => `
            <tr>
              <td>${row.position}</td>
              <td>${teamFromRow(row)} ${row.needsAdminTieBreak ? `<span class="badge locked">decyzja admina</span>` : ""}</td>
              <td>${row.played}</td>
              <td><strong>${row.points}</strong></td>
              <td>${row.goalsFor}:${row.goalsAgainst}</td>
              <td>${row.goalDifference}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function renderKnockout() {
  return `
    <div class="bracket">
      ${knockoutRounds.map((round) => `
        <section class="bracket-column">
          <h3>${round}</h3>
          ${state.matches.filter((match) => match.round === round).sort(byKickoff).map(renderMatchCard).join("")}
        </section>
      `).join("")}
    </div>
  `;
}

function renderRanking() {
  const ranking = [...state.ranking].sort(state.sortRanking === "points"
    ? (a, b) => b.points - a.points || a.place - b.place
    : (a, b) => a.place - b.place);
  return `
    <div class="tabs">
      <button data-sort="place" class="${state.sortRanking === "place" ? "active" : ""}">Sortuj wg miejsca</button>
      <button data-sort="points" class="${state.sortRanking === "points" ? "active" : ""}">Sortuj wg punktów</button>
    </div>
    <table>
      <thead><tr><th>Miejsce</th><th>Uczestnik</th><th>Punkty</th><th>Typy</th><th>Profil</th></tr></thead>
      <tbody>
        ${ranking.map((item) => `
          <tr>
            <td>${item.place}</td>
            <td>${escapeHtml(item.username)}</td>
            <td><strong>${item.points}</strong></td>
            <td>${item.predictionsCount}</td>
            <td><button class="ghost" data-profile="${item.id}">Otwórz</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${state.profile ? renderProfileModal() : ""}
  `;
}

function renderMyProfile() {
  const myPredictions = state.matches
    .filter((match) => match.prediction)
    .sort(byKickoff)
    .map((match) => ({ match, prediction: match.prediction, result: match.result, points: match.points }));
  return `
    <section class="panel">
      <h3>Moje zapisane typy</h3>
      <div class="match-list">${myPredictions.map(renderProfilePrediction).join("") || empty("Nie masz jeszcze zapisanych typów.")}</div>
    </section>
  `;
}

function renderAdmin() {
  if (state.user.role !== "admin") return empty("Brak dostępu.");
  return `
    <section class="panel">
      <h3>Ustawienia</h3>
      <label class="form-row">
        <input type="checkbox" id="hide-predictions" ${state.settings.hidePredictionsUntilKickoff ? "checked" : ""}>
        Ukrywaj typy innych użytkowników do rozpoczęcia meczu
      </label>
    </section>
    <section class="panel" style="margin-top:18px">
      <h3>Rozstrzyganie tabel grupowych</h3>
      <div class="grid three">
        ${groups.map((group) => renderAdminGroupTieBreak(group)).join("")}
      </div>
    </section>
    <section class="panel" style="margin-top:18px">
      <h3>Drużyny z trzecich miejsc w drabince</h3>
      <div class="match-list">${renderThirdPlaceSlotForms()}</div>
    </section>
    <section class="panel" style="margin-top:18px">
      <h3>Awaryjna korekta typu</h3>
      <form class="form-row" id="admin-prediction-form">
        <select name="userId" required>
          <option value="">Uczestnik</option>
          ${state.users.map((user) => `<option value="${user.id}">${escapeHtml(user.username)}</option>`).join("")}
        </select>
        <select name="matchId" required>
          <option value="">Mecz</option>
          ${state.matches.sort(byKickoff).map((match) => `<option value="${match.id}">#${match.matchNo} ${teamLabel(match, "home")} - ${teamLabel(match, "away")}</option>`).join("")}
        </select>
        <input name="homeGoals" type="number" min="0" max="30" required>
        <span>:</span>
        <input name="awayGoals" type="number" min="0" max="30" required>
        <select name="advancingTeam" aria-label="Drużyna awansująca">
          <option value="">Awans, jeśli faza pucharowa</option>
          <option value="home">Pierwsza drużyna</option>
          <option value="away">Druga drużyna</option>
        </select>
        <button class="primary">Zapisz typ użytkownika</button>
      </form>
    </section>
    <section class="panel" style="margin-top:18px">
      <h3>Wyniki meczów</h3>
      ${state.matches.sort(byKickoff).map((match) => `
        <form class="admin-result" data-admin-result="${match.id}">
          <div>
            <strong>#${match.matchNo} ${teamLabel(match, "home")} - ${teamLabel(match, "away")}</strong>
            <div class="muted">${plDate(match.kickoff)} · ${escapeHtml(match.venue)} · ${escapeHtml(match.round)}</div>
          </div>
          <input name="homeGoals" type="number" min="0" max="30" value="${match.result?.homeGoals ?? ""}" required>
          <input name="awayGoals" type="number" min="0" max="30" value="${match.result?.awayGoals ?? ""}" required>
          ${match.stage === "knockout" ? advancingSelect(match, match.result?.advancingTeam) : ""}
          <button class="primary">Zapisz</button>
        </form>
      `).join("")}
    </section>
  `;
}

function renderAdminGroupTieBreak(group) {
  const standing = state.groupStandings?.[group];
  if (!standing) return "";
  const currentOrder = state.groupTieBreaks?.[group] || [];
  return `
    <form class="match-card" data-group-tiebreak="${group}">
      <h3>Grupa ${group}</h3>
      <div class="muted">Ustaw kolejność tylko wtedy, gdy po punktach, H2H, bilansie i golach nadal jest remis.</div>
      ${[0, 1, 2, 3].map((index) => `
        <select name="order${index}">
          <option value="">Pozycja ${index + 1}</option>
          ${standing.rows.map((row) => `<option value="${row.code}" ${currentOrder[index] === row.code ? "selected" : ""}>${plainRowLabel(row)}</option>`).join("")}
        </select>
      `).join("")}
      <button class="primary full" style="margin-top:8px">Zapisz kolejność</button>
    </form>
  `;
}

function renderThirdPlaceSlotForms() {
  const slots = state.matches
    .filter((match) => match.stage === "knockout")
    .flatMap((match) => [
      { match, side: "home", slot: match.homeOriginalCode },
      { match, side: "away", slot: match.awayOriginalCode }
    ])
    .filter((item) => /^3\s?[A-L]+$/.test(String(item.slot)));
  if (!slots.length) return empty("Brak slotów z trzecich miejsc.");

  return slots.map((item) => {
    const allowedGroups = String(item.slot).replace(/[^A-L]/g, "").split("");
    const candidates = state.thirdPlaceCandidates.filter((row) => allowedGroups.includes(row.group));
    const current = state.knockoutSlotOverrides?.[`${item.match.id}:${item.side}`] || "";
    return `
      <form class="admin-result" data-third-slot="${item.match.id}:${item.side}">
        <div>
          <strong>#${item.match.matchNo} · ${escapeHtml(item.slot)}</strong>
          <div class="muted">${teamLabel(item.match, item.side)} · dozwolone grupy: ${allowedGroups.join(", ")}</div>
        </div>
        <select name="teamCode" required>
          <option value="">Wybierz drużynę</option>
          ${candidates.map((row) => `<option value="${row.code}" ${current === row.code ? "selected" : ""}>${plainRowLabel(row)}</option>`).join("")}
        </select>
        <button class="primary">Zapisz</button>
      </form>
    `;
  }).join("");
}

function renderMatchCard(match) {
  const canPredict = state.user.role !== "admin" && !match.locked && !match.prediction;
  const locked = match.locked || state.user.role === "admin";
  return `
    <article class="match-card">
      <div class="match-head">
        <div>
          <div class="teams">
            <span>${teamLabel(match, "home")}</span>
            <span>${teamLabel(match, "away")}</span>
          </div>
          <div class="muted">#${match.matchNo} · ${plDate(match.kickoff)} · ${escapeHtml(match.venue)}</div>
        </div>
        <span class="badge ${match.locked ? "locked" : ""}">${match.locked ? "Zablokowany" : "Do typowania"}</span>
      </div>
      ${match.prediction ? `<div class="notice">Twój typ: ${formatScore(match.prediction)}${formatAdvance(match, match.prediction)} · Punkty: <strong>${match.points}</strong></div>` : ""}
      ${match.result ? `<div class="success">Wynik: ${formatScore(match.result)}${formatAdvance(match, match.result)}</div>` : ""}
      ${match.stats ? renderStats(match) : ""}
      ${canPredict ? predictionForm(match) : (!match.prediction && !locked ? "" : "")}
    </article>
  `;
}

function predictionForm(match) {
  return `
    <form class="form-row" data-prediction="${match.id}">
      <input name="homeGoals" type="number" min="0" max="30" required aria-label="Gole gospodarza">
      <span>:</span>
      <input name="awayGoals" type="number" min="0" max="30" required aria-label="Gole gościa">
      ${match.stage === "knockout" ? advancingSelect(match, null) : ""}
      <button class="primary">Zapisz typ</button>
    </form>
  `;
}

function advancingSelect(match, selected) {
  return `
    <select name="advancingTeam" aria-label="Drużyna awansująca">
      <option value="">Awans</option>
      <option value="home" ${selected === "home" ? "selected" : ""}>${plainTeamLabel(match, "home")}</option>
      <option value="away" ${selected === "away" ? "selected" : ""}>${plainTeamLabel(match, "away")}</option>
    </select>
  `;
}

function renderStats(match) {
  const s = match.stats;
  return `
    <div class="statbar">
      <span>${teamLabel(match, "home")}: ${s.home}</span>
      <span>Remis: ${s.draw}</span>
      <span>${teamLabel(match, "away")}: ${s.away}</span>
    </div>
  `;
}

function renderRankingCard(item) {
  return `
    <div class="ranking-row">
      <span class="rank-place">${item.place}</span>
      <strong>${escapeHtml(item.username)}</strong>
      <span>${item.points} pkt</span>
      <button class="ghost" data-profile="${item.id}">Profil</button>
    </div>
  `;
}

function renderProfileModal() {
  return `
    <section class="panel" style="margin-top:18px">
      <div class="topbar">
        <div>
          <h3>${escapeHtml(state.profile.user.username)}</h3>
          <div class="muted">Miejsce ${state.profile.ranking?.place ?? "-"} · ${state.profile.ranking?.points ?? 0} pkt</div>
        </div>
        <button class="ghost" id="close-profile">Zamknij</button>
      </div>
      <div class="match-list">${state.profile.predictions.map(renderProfilePrediction).join("") || empty("Brak widocznych typów.")}</div>
    </section>
  `;
}

function renderProfilePrediction(item) {
  return `
    <div class="profile-row">
      <strong>#${item.match.matchNo} ${teamLabel(item.match, "home")} - ${teamLabel(item.match, "away")}</strong>
      <div class="muted">${plDate(item.match.kickoff)} · ${escapeHtml(item.match.round)}</div>
      <div>Typ: <strong>${formatScore(item.prediction)}${formatAdvance(item.match, item.prediction)}</strong></div>
      <div>Wynik: <strong>${item.result ? `${formatScore(item.result)}${formatAdvance(item.match, item.result)}` : "nie wpisano"}</strong></div>
      <div>Punkty: <strong>${item.points}</strong></div>
    </div>
  `;
}

function formatScore(item) {
  return `${item.homeGoals}:${item.awayGoals}`;
}

function formatAdvance(match, item) {
  if (match.stage !== "knockout" || !item.advancingTeam) return "";
  return ` · awans: ${plainTeamLabel(match, item.advancingTeam)}`;
}

function plainTeamLabel(match, side) {
  const team = side === "home" ? match.homeTeam : match.awayTeam;
  return team;
}

function teamLabel(match, side) {
  const code = side === "home" ? match.homeFlagCode : match.awayFlagCode;
  const team = side === "home" ? match.homeTeam : match.awayTeam;
  const flag = code
    ? `<img class="flag" src="https://flagcdn.com/24x18/${escapeHtml(code)}.png" srcset="https://flagcdn.com/48x36/${escapeHtml(code)}.png 2x" width="24" height="18" alt="">`
    : `<span class="flag-placeholder"></span>`;
  return `<span class="team-label">${flag}<span>${escapeHtml(team)}</span></span>`;
}

function plainRowLabel(row) {
  return `${row.code} ${row.name}`;
}

function teamFromRow(row) {
  const flag = row.flagCode
    ? `<img class="flag" src="https://flagcdn.com/24x18/${escapeHtml(row.flagCode)}.png" srcset="https://flagcdn.com/48x36/${escapeHtml(row.flagCode)}.png 2x" width="24" height="18" alt="">`
    : `<span class="flag-placeholder"></span>`;
  return `<span class="team-label">${flag}<span>${escapeHtml(row.name)}</span></span>`;
}

function empty(text) {
  return `<p class="muted">${escapeHtml(text)}</p>`;
}

function byKickoff(a, b) {
  return new Date(a.kickoff) - new Date(b.kickoff);
}

function bindCommon() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.message = "";
      state.error = "";
      state.profile = null;
      renderApp();
    });
  });

  document.querySelector("#logout")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    renderAuth();
  });

  document.querySelectorAll("[data-group]").forEach((button) => {
    button.addEventListener("click", () => {
      state.group = button.dataset.group;
      renderApp();
    });
  });

  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      state.sortRanking = button.dataset.sort;
      renderApp();
    });
  });

  document.querySelectorAll("[data-profile]").forEach((button) => {
    button.addEventListener("click", () => loadProfile(button.dataset.profile));
  });

  document.querySelector("#close-profile")?.addEventListener("click", () => {
    state.profile = null;
    renderApp();
  });

  document.querySelectorAll("[data-prediction]").forEach((form) => {
    form.addEventListener("submit", submitPrediction);
    form.addEventListener("input", () => syncAdvancing(form));
  });

  document.querySelectorAll("[data-admin-result]").forEach((form) => {
    form.addEventListener("submit", submitResult);
    form.addEventListener("input", () => syncAdvancing(form));
  });

  document.querySelector("#admin-prediction-form")?.addEventListener("submit", submitAdminPrediction);

  document.querySelectorAll("[data-group-tiebreak]").forEach((form) => {
    form.addEventListener("submit", submitGroupTieBreak);
  });

  document.querySelectorAll("[data-third-slot]").forEach((form) => {
    form.addEventListener("submit", submitThirdPlaceSlot);
  });

  document.querySelector("#hide-predictions")?.addEventListener("change", async (event) => {
    try {
      const data = await api("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ hidePredictionsUntilKickoff: event.target.checked })
      });
      state.settings = data.settings;
      state.message = "Zapisano ustawienia.";
      renderApp();
    } catch (error) {
      showError(error);
    }
  });
}

function syncAdvancing(form) {
  const select = form.querySelector("[name='advancingTeam']");
  if (!select) return;
  const home = Number(form.querySelector("[name='homeGoals']").value);
  const away = Number(form.querySelector("[name='awayGoals']").value);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return;
  if (home > away) select.value = "home";
  if (away > home) select.value = "away";
  select.disabled = home !== away;
}

async function submitPrediction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const select = form.querySelector("[name='advancingTeam']");
  if (select) select.disabled = false;
  const body = Object.fromEntries(new FormData(form));
  body.matchId = Number(form.dataset.prediction);
  try {
    await api("/api/predictions", { method: "POST", body: JSON.stringify(body) });
    state.message = "Typ zapisany.";
    await loadBootstrap();
  } catch (error) {
    showError(error);
  }
}

async function submitResult(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const select = form.querySelector("[name='advancingTeam']");
  if (select) select.disabled = false;
  const body = Object.fromEntries(new FormData(form));
  body.matchId = Number(form.dataset.adminResult);
  try {
    await api("/api/admin/results", { method: "POST", body: JSON.stringify(body) });
    state.message = "Wynik zapisany.";
    await loadBootstrap();
    state.view = "admin";
    renderApp();
  } catch (error) {
    showError(error);
  }
}

async function submitAdminPrediction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form));
  try {
    await api("/api/admin/predictions", { method: "POST", body: JSON.stringify(body) });
    state.message = "Typ użytkownika zapisany.";
    await loadBootstrap();
    state.view = "admin";
    renderApp();
  } catch (error) {
    showError(error);
  }
}

async function submitGroupTieBreak(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const order = [0, 1, 2, 3].map((index) => data.get(`order${index}`)).filter(Boolean);
  try {
    await api("/api/admin/group-tiebreaks", {
      method: "POST",
      body: JSON.stringify({ group: form.dataset.groupTiebreak, order })
    });
    state.message = "Kolejność grupy zapisana.";
    await loadBootstrap();
    state.view = "admin";
    renderApp();
  } catch (error) {
    showError(error);
  }
}

async function submitThirdPlaceSlot(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const [matchId, side] = form.dataset.thirdSlot.split(":");
  const teamCode = new FormData(form).get("teamCode");
  try {
    await api("/api/admin/knockout-slots", {
      method: "POST",
      body: JSON.stringify({ matchId: Number(matchId), side, teamCode })
    });
    state.message = "Slot drabinki zapisany.";
    await loadBootstrap();
    state.view = "admin";
    renderApp();
  } catch (error) {
    showError(error);
  }
}

async function loadProfile(userId) {
  try {
    state.profile = await api(`/api/users/${userId}/profile`);
    renderApp();
  } catch (error) {
    showError(error);
  }
}

function showError(error) {
  state.error = error.message;
  state.message = "";
  renderApp();
}

init().catch((error) => {
  app.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
});
