# MetanQueue

Онлайн-очередь на метановые заправки Ташкента.

Стек: Next.js 16 (App Router), TypeScript, Tailwind CSS 4. Далее: Supabase, Yandex Maps.

## Запуск

Нужен Node.js 20.9+.

```bash
npm install
npm run dev        # http://localhost:3000
```

## Проверки

```bash
npm run lint
npm run typecheck
npm run build
```

Те же проверки выполняет GitHub Actions (`.github/workflows/ci.yml`) на каждый push в `main` и pull request.

## Секреты

Переменные окружения хранятся в `.env.local` (не коммитится). Шаблон: `.env.example`.

## Дизайн

Референс: `design-references/metanqueue-reference.png`. Акцент кнопок: `#06866A`.
