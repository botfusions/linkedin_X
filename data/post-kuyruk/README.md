# Shared post queue (own-content LinkedIn posts)

This folder is the hand-off between two agents:
- **Writer** (Botfusions Web sessions, Claude): writes finished Turkish posts here, one `.md` file per post.
- **Publisher** (Hermes job "LinkedIn Günlük GEO Post 10", `~/.hermes/scripts/linkedin_gunluk_post.py` + `prompts/gunluk-geo-post.md`): at the 10:00 TRT slot it takes the first waiting file, renders the card, runs metin-bakis (opus) and sends it to Cenk on Telegram. If the queue is empty, the slot runs the normal news post. The 16:00 slot never reads this folder.

## File format
File name: `NN-<slug>.md`. `NN` sets the order (lowest first). Header lines, then `---`, then the post text exactly as it should appear:

```
status: bekliyor
source_url: https://botfusions.com/blog/60
konu: one-line topic, Turkish
olgular: the facts the post may use, each with its source page (the checker verifies against this list)
---
<post text>
```

- `status`: `bekliyor` = waiting. The wrapper rewrites it to `kullanildi <YYYY-MM-DD> <slot>` BEFORE it publishes, so an item is never used twice, even after a timeout. Any other value is skipped.
- `source_url`: an https page on botfusions.com. It becomes the post's first comment ("Kaynak: <url>"). Do not put the link in the text.

## Rules for the writer
- Turkish, first person plural ("biz"), 700-1300 characters, hook sentence under 140 characters, ends with one real question, max 3 hashtags at the end, no link in the text.
- Every number comes from `source_url` with its date in the same paragraph. List them under `olgular`.
- Botfusions is a GEO agency (clinics, KOBİ, B2B SaaS). No self-ranking, no result or timeline promise, no customer names, no measurement-vendor names, do not list the engine set (open question on Perplexity).
- Before writing here: independent metin-bakis check of the text.
- Do not put two posts from the same source page next to each other.

## Rules for the publisher
- Use the text as written. Change it only to apply a metin-bakis finding, and then only through the `turkce-insani-yazar` skill. Never add facts that are not under `olgular`.
- Card: same template and steps as the news post (step 6 of the prompt), content from this post.
- Queue posts are NOT auto-published: they go to Cenk's Telegram press, even while news posts run with `AUTO`.
