# Specyfikacja aplikacji Typer MŚ 2026

## Ustalone reguły

- Punktacja za dokładny wynik i poprawny rezultat nie sumuje się.
- Faza grupowa: dokładny wynik daje 5 pkt, sam rezultat daje 3 pkt.
- Faza pucharowa: dokładny wynik albo rezultat działa jak wyżej, a poprawnie wskazana drużyna awansująca dodaje 2 pkt.
- Rezultat w fazie pucharowej liczony jest po 90 minutach, więc remis jest normalnym typem.
- Przy remisie użytkownik musi wskazać drużynę awansującą.
- Jeśli wynik wskazuje zwycięzcę, awansująca drużyna ustawiana jest automatycznie.
- Typowanie blokuje się automatycznie o godzinie rozpoczęcia meczu według czasu polskiego.
- Dodatkowe typowania turniejowe zostały usunięte.
- Rejestracja jest otwarta dla każdego.
- Hasła są hashowane.
- Konto administratora powstaje automatycznie.
- Administrator nie jest widoczny w rankingu i nie bierze udziału w typowaniu.
- Administrator może wpisywać i poprawiać wyniki po zatwierdzeniu.
- Administrator może awaryjnie dodać lub poprawić typ uczestnika.
- Typy innych użytkowników oraz statystyki meczu są widoczne dopiero po rozpoczęciu spotkania.

## Moduły funkcjonalne

1. Autoryzacja
   - rejestracja,
   - logowanie,
   - wylogowanie,
   - sesja w ciasteczku `HttpOnly`.

2. Panel główny
   - ranking TOP 10,
   - mecze dostępne do typowania w ciągu najbliższych 2 dni,
   - mecze z poprzednich 2 dni z typem, wynikiem i punktami.

3. Faza grupowa
   - wszystkie mecze grupowe,
   - filtrowanie po grupach A-L,
   - formularz typowania wyniku.

4. Faza pucharowa
   - mecze ułożone w kolumnach drabinki,
   - typ wyniku po 90 minutach,
   - wybór awansującej drużyny przy remisie,
   - automatyczny wybór awansującego przy zwycięstwie jednej ze stron.

5. Ranking
   - pełna lista uczestników,
   - sortowanie według miejsca lub punktów,
   - profile uczestników.

6. Profile i historia
   - użytkownik widzi swoje typy,
   - inni użytkownicy widzą cudze typy dopiero po rozpoczęciu meczu,
   - przy każdym typie widoczny jest wynik i zdobyte punkty, jeśli wynik został wpisany.

7. Panel administratora
   - ręczne wpisywanie wyników,
   - poprawianie wyników,
   - awaryjna korekta typów uczestników,
   - ustawienie ukrywania typów do rozpoczęcia meczu.

## Architektura

Aplikacja jest monolitem Node.js:

- `server.js` obsługuje API, sesje, routing statyczny i punktację.
- `public/` zawiera frontend.
- `data/seed.js` zawiera terminarz 104 meczów.
- `data/db.json` jest lokalną bazą danych generowaną przy pierwszym starcie.

## Model danych

`users`

- `id`
- `username`
- `role`
- `salt`
- `passwordHash`
- `createdAt`

`sessions`

- `token`
- `userId`
- `createdAt`
- `expiresAt`

`matches`

- `id`
- `matchNo`
- `stage`
- `group`
- `round`
- `kickoff`
- `venue`
- `homeCode`
- `awayCode`
- `homeTeam`
- `awayTeam`

`predictions`

- `userId`
- `matchId`
- `homeGoals`
- `awayGoals`
- `advancingTeam`
- `createdAt`

`results`

- `matchId`
- `homeGoals`
- `awayGoals`
- `advancingTeam`
- `createdAt`
- `updatedAt`

`settings`

- `hidePredictionsUntilKickoff`

## Endpointy

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/bootstrap`
- `POST /api/predictions`
- `POST /api/admin/results`
- `POST /api/admin/predictions`
- `POST /api/admin/settings`
- `GET /api/users/:id/profile`
