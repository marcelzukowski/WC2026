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

## Darmowe wdrożenie online

Najprostsza darmowa ścieżka dla tej wersji:

1. Umieść projekt w repozytorium GitHub.
2. Wdróż aplikację Node.js na darmowym hostingu obsługującym proces webowy, np. Render, Koyeb albo Fly.io, jeśli ich aktualny darmowy limit jest dostępny dla Twojego konta.
3. Dla produkcji zamiast pliku JSON użyj darmowej bazy Postgres, np. Supabase Free, Neon Free albo podobnej usługi z aktywnym darmowym planem.

Wersja lokalna używa pliku JSON, bo dzięki temu można ją uruchomić bez instalowania bazy danych. Przy publicznym hostingu plikowy storage bywa nietrwały, dlatego produkcyjnie warto podmienić warstwę zapisu na Postgres.
