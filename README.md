# Typer MŚ 2026

Kompletna aplikacja webowa do typowania wyników meczów Mistrzostw Świata 2026. Projekt działa bez płatnych usług i bez zewnętrznych zależności npm.

## Stack

- Backend: Node.js, wbudowany moduł `http`
- Frontend: HTML, CSS, JavaScript
- Baza danych lokalnie: plik JSON `data/db.json`
- Hasła: `crypto.scrypt`
- Sesje: ciasteczko `HttpOnly`

## Uruchomienie lokalne

```powershell
npm start
```

Aplikacja działa pod adresem:

```text
http://localhost:3000
```

Domyślne konto administratora:

```text
admin / admin123
```

Hasło administratora można ustawić zmiennymi środowiskowymi przed pierwszym startem:

```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="mocne-haslo"
npm start
```

## Najważniejsze funkcje

- Rejestracja i logowanie użytkowników.
- Konto administratora wyłączone z rankingów i typowania.
- Automatyczna blokada typowania o godzinie rozpoczęcia meczu.
- Typ można zapisać tylko raz.
- Faza grupowa z podziałem na grupy.
- Faza pucharowa w formie drabinki.
- Typowanie wyniku po 90 minutach i drużyny awansującej.
- Ranking wszystkich uczestników.
- Profile użytkowników z widocznością typów dopiero po rozpoczęciu meczu.
- Statystyki typów przy meczu widoczne dopiero po rozpoczęciu meczu.
- Panel admina do wpisywania i poprawiania wyników.
- Awaryjna korekta typów uczestników przez administratora.

## Darmowe wdrożenie online bez własnej domeny

Rekomendowana ścieżka:

- hosting: Vercel Free,
- baza: Supabase Free,
- stały link: `https://nazwa-projektu.vercel.app`.

### 1. Supabase

1. Załóż darmowe konto na `https://supabase.com`.
2. Utwórz nowy projekt.
3. Wejdź w SQL Editor.
4. Wklej i uruchom zawartość pliku `supabase-schema.sql`.
5. Wejdź w Project Settings -> API.
6. Skopiuj:
   - Project URL,
   - `service_role` key.

Klucza `service_role` nie wklejaj do frontendu ani publicznie do repozytorium.

### 2. GitHub

Wrzuć projekt do repozytorium GitHub.

### 3. Vercel

1. Załóż konto na `https://vercel.com`.
2. Kliknij Add New -> Project.
3. Wybierz repozytorium z aplikacją.
4. Root Directory ustaw na `WC2026`, jeśli repozytorium zawiera folder nadrzędny.
5. Dodaj Environment Variables:

```text
SUPABASE_URL=adres projektu z Supabase
SUPABASE_SERVICE_ROLE_KEY=service_role key z Supabase
ADMIN_USERNAME=admin
ADMIN_PASSWORD=twoje_mocne_haslo
```

6. Kliknij Deploy.

Po wdrożeniu aplikacja będzie dostępna pod stałym adresem Vercel, np.

```text
https://wc2026-typer.vercel.app
```

### 4. Migracja lokalnej bazy do Supabase

Jeśli chcesz przenieść lokalne `data/db.json` do Supabase:

```powershell
$env:SUPABASE_URL="adres projektu z Supabase"
$env:SUPABASE_SERVICE_ROLE_KEY="service_role key"
npm run push-db
```

Jeśli tego nie zrobisz, aplikacja sama utworzy pusty stan przy pierwszym wejściu na wersję online.
