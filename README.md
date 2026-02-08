# DND-GAME — GitHub Pages + Supabase (MVP, DB-истина)

Этот пакет уже подготовлен под запуск **без Render/Node сервера**:

- Фронт (index.html/client.js/info-dnd-player.js/style.css) → **GitHub Pages**
- "Сервер" игры → **Supabase Postgres + Realtime (postgres_changes)**
- Прокси для dnd.su (CORS) → **Supabase Edge Function** (опционально)

> MVP: без логина (Auth) и без RLS. Для игры между своими.

---

## 1) Настройка Supabase DB (SQL)

Supabase Dashboard → **SQL Editor** → Run:

```sql
-- Rooms
create table if not exists public.rooms (
  id text primary key,
  name text not null,
  scenario text,
  created_at timestamptz not null default now()
);

-- Room state: DB-истина (весь state в jsonb)
create table if not exists public.room_state (
  room_id text primary key references public.rooms(id) on delete cascade,
  phase text not null default 'lobby' check (phase in ('lobby','initiative','exploration','combat','placement')),
  current_actor_id text,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Characters: "Сохранить/Загрузить основу" (весь лист целиком)
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,      -- localStorage userId
  name text not null,
  state jsonb not null,       -- {schemaVersion, savedAt, data: <sheet>}
  updated_at timestamptz not null default now()
);
create index if not exists idx_characters_user on public.characters(user_id);
```

### Важо для MVP
- В Table editor выключи **RLS** для таблиц `rooms`, `room_state`, `characters`.
- Realtime: включи репликацию для `room_state` (Database → Replication / Realtime).

---

## 2) Edge Function вместо `/api/fetch` (для заклинаний с dnd.su)

Если ты используешь загрузку описаний заклинаний с `dnd.su`, браузеру нужен CORS-прокси.

### Файл функции уже лежит тут
`supabase/functions/fetch/index.ts`

### Деплой
Нужно установить Supabase CLI локально и выполнить:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy fetch
```

После деплоя получишь URL вида:
`https://<project-ref>.functions.supabase.co/fetch`

---

## 3) Прописать ключи в `index.html`

Внизу `index.html` найди блок:

```js
window.SUPABASE_URL = "PASTE_SUPABASE_URL_HERE";
window.SUPABASE_ANON_KEY = "PASTE_SUPABASE_ANON_KEY_HERE";
window.SUPABASE_FETCH_FN = "PASTE_SUPABASE_FETCH_FN_URL_HERE";
```

- `SUPABASE_URL` и `SUPABASE_ANON_KEY` — Supabase Dashboard → Project Settings → API
- `SUPABASE_FETCH_FN` — URL Edge Function (можно оставить пустым, тогда заклинания через прокси не будут работать на GitHub Pages)

---

## 4) GitHub Pages

1. Создай репозиторий и залей **содержимое этой папки**.
2. GitHub → Settings → Pages → Deploy from branch → `main` / `/ (root)`.
3. Открой ссылку Pages — игра должна запуститься.

---

## Примечания по MVP
- Идентификатор пользователя хранится в `localStorage` как `dnd_user_id`.
  Можно входить под разными никами (ВАЛЯ/ЛОДКА), список персонажей будет один.
- Без RLS это не для публичного использования. Если захочешь сделать безопасно — добавим Auth/RLS.
