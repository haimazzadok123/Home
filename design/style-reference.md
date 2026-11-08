# Style reference

The user's preferred visual style for new projects. Use it as the starting
point for colors, fonts and buttons unless a project asks for something else.

## Original snippet (as provided)

```html
<!-- Pet Grooming Landing -->
<section class="bg-[#F8FAFC]">
<h1 class="font-['Fredoka'] text-[#1E293B]">
Happy Pets, Happy Life
</h1>
<button class="bg-[#F97316] hover:bg-[#EA580C]">
Book Grooming
</button>
</section>
```

## Tokens

| Role                 | Value      |
| -------------------- | ---------- |
| Page background      | `#F8FAFC`  |
| Headings / text      | `#1E293B`  |
| Primary button       | `#F97316`  |
| Primary button hover | `#EA580C`  |
| Display font         | Fredoka    |

## Notes

- Fredoka has no Hebrew letters. For Hebrew pages use
  `font-family: "Fredoka", "Varela Round", sans-serif;` so Latin text gets
  Fredoka and Hebrew falls back to the similar rounded Varela Round
  (both on Google Fonts).
- Supporting colors that fit this palette (from Tailwind's slate/orange):
  muted text `#64748B`, borders `#E2E8F0`, alt background `#F1F5F9`,
  soft orange `#FFEDD5`.
- Applied example: `public/datinofesh/index.html` (includes a dark mode).
