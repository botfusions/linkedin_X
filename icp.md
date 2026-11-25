# ICP: who counts as a Botfusions prospect on LinkedIn

Draft accepted by Cenk on 2026-11-25. Used by engager analytics (`data/engager/`) to sort people who
view Cenk's profile or engage with his posts.

## Segments

| Segment | Who | Action |
|---|---|---|
| **aday** (prospect) | Owner, founder, partner, CEO, GM, or marketing / digital / e-commerce manager of a Turkish business that sells to customers (SMB or larger). Includes professional firms (law, clinics, consultancies) and brands. | Goes on the weekly list. Cenk decides on contact. |
| **meslektaş** (peer) | People working in SEO / GEO / digital marketing agencies, freelancers, AI builders, consultants, competitors. | Separate list: possible partners or resellers, not clients. |
| **diğer** (other) | Students, job seekers, employees without buying power (BDR, specialist, teacher), unclear titles, anonymous viewers. | Count only. |

## Signals that raise priority inside "aday"
- Company name in the headline (a real business, not a personal brand).
- 1st-degree connection (a message is possible without a request).
- Recent: viewed or engaged in the last 7 days.

## Hard limits
- Read-only. No automatic messages, connection requests or likes.
- Store only what LinkedIn shows publicly: name, headline, profile URL, degree, when seen, source.
- The list stays on this Mac (`data/engager/` is gitignored).
