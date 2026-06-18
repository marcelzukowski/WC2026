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
  message: "",
  error: "",
  profile: null,
  activeMatchId: null
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

function shortDate(iso) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
  if (state.user?.mustChangePassword) {
    renderPasswordChange();
    return;
  }
  renderApp();
}

function renderPasswordChange() {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-hero">
        <h1>Nowe hasło</h1>
        <p>Administrator ustawił hasło tymczasowe. Ustaw własne hasło, żeby przejść dalej.</p>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <h2>Ustaw nowe hasło</h2>
          <form id="password-change-form" class="grid">
            <input name="password" placeholder="Nowe hasło" type="password" autocomplete="new-password" required>
            <input name="passwordRepeat" placeholder="Powtórz nowe hasło" type="password" autocomplete="new-password" required>
            <button class="primary full" type="submit">Zapisz nowe hasło</button>
          </form>
          <button class="ghost full" id="password-change-logout" style="margin-top:10px">Wyloguj</button>
          <div id="password-change-error"></div>
        </div>
      </section>
    </main>
  `;
  document.querySelector("#password-change-form").addEventListener("submit", submitPasswordChange);
  document.querySelector("#password-change-logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    renderAuth();
  });
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
          <p class="muted">${mode === "login" ? "Zaloguj się na swoje konto albo przejdź do rejestracji." : "Rejestracja jest otwarta dla wszystkich."}</p>
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
    profile: ["Profil gracza", "Typy i punkty wybranego uczestnika."],
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
  if (state.view === "profile") return renderProfilePage();
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
    .sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));

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
  const left = [
    ["1/16 finału", [73, 74, 75, 76, 77, 78, 79, 80]],
    ["1/8 finału", [89, 90, 91, 92]],
    ["Ćwierćfinał", [97, 99]],
    ["Półfinał", [101]]
  ];
  const right = [
    ["Półfinał", [102]],
    ["Ćwierćfinał", [98, 100]],
    ["1/8 finału", [93, 94, 95, 96]],
    ["1/16 finału", [81, 82, 83, 84, 85, 86, 87, 88]]
  ];
  return `
    <div class="bracket-note">
      Typowanie meczu pucharowego włącza się automatycznie, gdy znane są obie drużyny i mecz jeszcze się nie rozpoczął.
    </div>
    <div class="bracket bracket-tree">
      <div class="bracket-side bracket-side-left">
        ${left.map(([title, ids]) => renderBracketColumn(title, ids)).join("")}
      </div>
      <section class="bracket-center">
        <div class="trophy-card">
          <div class="trophy">1</div>
          <h3>Mecz o 1. miejsce</h3>
          ${renderCenterMatch(104)}
        </div>
        <div class="third-place-card">
          <h3>Mecz o 3. miejsce</h3>
          ${renderCenterMatch(103)}
        </div>
      </section>
      <div class="bracket-side bracket-side-right">
        ${right.map(([title, ids]) => renderBracketColumn(title, ids)).join("")}
      </div>
    </div>
    ${renderMatchModal()}
  `;
}

function renderBracketColumn(title, ids) {
  return `
    <section class="bracket-column">
      <h3>${title}</h3>
      ${ids.map((id) => state.matches.find((match) => match.id === id)).filter(Boolean).map(renderBracketMatchCard).join("")}
    </section>
  `;
}

function renderCenterMatch(id) {
  const match = state.matches.find((item) => item.id === id);
  return match ? renderBracketMatchCard(match) : empty("Brak meczu.");
}

function renderRanking() {
  return `
    <table>
      <thead><tr><th>Miejsce</th><th>Uczestnik</th><th>Punkty</th><th>Typy</th><th>Profil</th></tr></thead>
      <tbody>
        ${state.ranking.map((item) => `
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
  `;
}

function renderMyProfile() {
  const myPredictions = state.matches
    .filter((match) => match.prediction)
    .sort(byProfileKickoff)
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
      <h3>Uczestnicy</h3>
      <div class="match-list">${renderAdminUsers()}</div>
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

function renderAdminUsers() {
  if (!state.users.length) return empty("Brak zarejestrowanych uczestników.");
  return state.users.map((user) => `
    <div class="admin-user-row">
      <div>
        <strong>${escapeHtml(user.username)}</strong>
        <div class="muted">${user.mustChangePassword ? "musi zmienić hasło przy logowaniu" : "aktywne konto"}</div>
      </div>
      <form class="form-row" data-reset-password="${user.id}">
        <input name="password" type="text" placeholder="Hasło tymczasowe" required>
        <button class="primary">Ustaw tymczasowe</button>
      </form>
      <button class="danger" data-delete-user="${user.id}" type="button">Usuń</button>
    </div>
  `).join("");
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

function renderBracketMatchCard(match) {
  const teamsKnown = match.stage === "group" || (match.homeResolved && match.awayResolved);
  const status = match.result ? formatScore(match.result) : (!teamsKnown ? "Czeka" : (match.prediction ? "Twój typ" : "Typuj"));
  const statusClass = match.result ? "gold" : (!teamsKnown ? "locked" : "");
  return `
    <button class="bracket-match ${!teamsKnown ? "pending" : ""}" data-open-match="${match.id}" type="button">
      <span class="bracket-teams">
        <span>${teamLabel(match, "home")}</span>
        <span>${teamLabel(match, "away")}</span>
      </span>
      <span class="bracket-meta">#${match.matchNo} · ${shortDate(match.kickoff)}</span>
      <span class="badge ${statusClass}">${status}</span>
    </button>
  `;
}

function renderMatchModal() {
  if (!state.activeMatchId) return "";
  const match = state.matches.find((item) => item.id === state.activeMatchId);
  if (!match) return "";
  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal" role="dialog" aria-modal="true" aria-label="Mecz">
        <button class="modal-close" type="button" data-close-modal>×</button>
        ${renderMatchCard(match, { forceDetails: true })}
      </section>
    </div>
  `;
}

function renderMatchCard(match, options = {}) {
  const teamsKnown = match.stage === "group" || (match.homeResolved && match.awayResolved);
  const canSubmitPrediction = state.user.role !== "admin" && teamsKnown && !match.locked;
  const isAdmin = state.user.role === "admin";
  const locked = match.locked || state.user.role === "admin";
  const badgeText = !teamsKnown ? "Czeka na drużyny" : (isAdmin ? "Podgląd admina" : (match.locked ? "Zablokowany" : "Do typowania"));
  const badgeClass = match.locked || !teamsKnown || isAdmin ? "locked" : "";
  const detailsClass = options.forceDetails ? " match-card-details" : "";
  return `
    <article class="match-card${detailsClass}">
      <div class="match-head">
        <div>
          <div class="teams">
            <span>${teamLabel(match, "home")}</span>
            <span>${teamLabel(match, "away")}</span>
          </div>
          <div class="muted">#${match.matchNo} · ${plDate(match.kickoff)} · ${escapeHtml(match.venue)}</div>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      ${!teamsKnown ? `<div class="notice">Typowanie ruszy, gdy obie drużyny zostaną podstawione do tego meczu.</div>` : ""}
      ${isAdmin && teamsKnown ? `<div class="notice">Administrator nie bierze udziału w typowaniu. Typy użytkowników można awaryjnie poprawić w panelu admina.</div>` : ""}
      ${match.prediction ? `<div class="notice">Twój typ: ${formatScore(match.prediction)}${formatAdvance(match, match.prediction)} · Punkty: <strong>${match.points}</strong></div>` : ""}
      ${match.result ? `<div class="success">Wynik: ${formatScore(match.result)}${formatAdvance(match, match.result)}</div>` : ""}
      ${match.stats ? renderStats(match) : ""}
      ${canSubmitPrediction ? predictionForm(match, match.prediction) : ""}
    </article>
  `;
}

function predictionForm(match, prediction = null) {
  return `
    <form class="form-row" data-prediction="${match.id}">
      <input name="homeGoals" type="number" min="0" max="30" value="${prediction?.homeGoals ?? ""}" required aria-label="Gole gospodarza">
      <span>:</span>
      <input name="awayGoals" type="number" min="0" max="30" value="${prediction?.awayGoals ?? ""}" required aria-label="Gole gościa">
      ${match.stage === "knockout" ? advancingSelect(match, prediction?.advancingTeam ?? null) : ""}
      <button class="primary">${prediction ? "Zapisz zmiany" : "Zapisz typ"}</button>
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

function renderProfilePage() {
  if (!state.profile) {
    state.view = "ranking";
    return renderRanking();
  }
  return `
    <section class="panel">
      <div class="topbar">
        <div>
          <h3>${escapeHtml(state.profile.user.username)}</h3>
          <div class="muted">Miejsce ${state.profile.ranking?.place ?? "-"} · ${state.profile.ranking?.points ?? 0} pkt</div>
        </div>
        <button class="ghost" id="back-ranking">Wróć do rankingu</button>
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

function byProfileKickoff(a, b) {
  const now = Date.now();
  const aTime = new Date(a.kickoff).getTime();
  const bTime = new Date(b.kickoff).getTime();
  const aUpcoming = aTime >= now;
  const bUpcoming = bTime >= now;
  if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
  return aUpcoming ? aTime - bTime : bTime - aTime;
}

function bindCommon() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.message = "";
      state.error = "";
      if (state.view !== "profile") state.profile = null;
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

  document.querySelectorAll("[data-profile]").forEach((button) => {
    button.addEventListener("click", () => loadProfile(button.dataset.profile));
  });

  document.querySelectorAll("[data-open-match]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeMatchId = Number(button.dataset.openMatch);
      renderApp();
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element || element.classList.contains("modal-close")) {
        state.activeMatchId = null;
        renderApp();
      }
    });
  });

  document.querySelector("#back-ranking")?.addEventListener("click", () => {
    state.profile = null;
    state.view = "ranking";
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

  document.querySelectorAll("[data-reset-password]").forEach((form) => {
    form.addEventListener("submit", submitResetPassword);
  });

  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => deleteUser(button.dataset.deleteUser));
  });

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
      state.activeMatchId = null;
      await loadBootstrap();
    } catch (error) {
    showError(error);
  }
}

async function submitPasswordChange(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const password = String(form.get("password") || "");
  const passwordRepeat = String(form.get("passwordRepeat") || "");
  const errorBox = document.querySelector("#password-change-error");
  if (password !== passwordRepeat) {
    errorBox.innerHTML = `<div class="error">Hasła nie są takie same.</div>`;
    return;
  }
  try {
    await api("/api/change-password", {
      method: "POST",
      body: JSON.stringify({ password })
    });
    await loadBootstrap();
  } catch (error) {
    errorBox.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
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

async function submitResetPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const password = new FormData(form).get("password");
  try {
    const data = await api("/api/admin/users/reset-password", {
      method: "POST",
      body: JSON.stringify({ userId: form.dataset.resetPassword, password })
    });
    state.users = data.users;
    state.message = "Ustawiono hasło tymczasowe.";
    renderApp();
  } catch (error) {
    showError(error);
  }
}

async function deleteUser(userId) {
  if (!confirm("Usunąć tego użytkownika razem z jego typami?")) return;
  try {
    const data = await api("/api/admin/users/delete", {
      method: "POST",
      body: JSON.stringify({ userId })
    });
    state.users = data.users;
    state.ranking = data.ranking;
    state.message = "Użytkownik został usunięty.";
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
    state.view = "profile";
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
