# How the Aurion web interface works

Reverse-engineered from browser HAR captures (JUNIA, November 2026). Aurion is a
JSF/PrimeFaces application: pages are server-side stateful, every form carries a
`javax.faces.ViewState` token, and component ids such as `j_idt43` are generated and
**change between Aurion releases**. The scraper therefore reads ids from the pages
instead of hard-coding them.

## Flow

| #   | Request                                                                                                     | Response                                                                                                                       | Notes                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | `GET /`                                                                                                     | `302 → /faces/Login.xhtml`, `Set-Cookie: JSESSIONID`                                                                           | anonymous session                                                     |
| 2   | `GET /faces/Login.xhtml`                                                                                    | `200` login page                                                                                                               | form `#formulaireSpring`, `action="/login"`                           |
| 3   | `POST /login` `username`, `password`, `<submit button id>`                                                  | success: `302 → /` + **new** `JSESSIONID`<br>failure: `200` login page with `.ui-messages-error` ("Login or password invalid") | the submit button id was `j_idt28` in 2025 and `j_idt43` in 2026      |
| 4   | `GET /`                                                                                                     | `200` home page (`MainMenuPage.xhtml`)                                                                                         | sidebar menu inside `form#form`                                       |
| 5   | `POST /faces/MainMenuPage.xhtml` all form fields + `form:sidebar=form:sidebar` + `form:sidebar_menuid=<id>` | `302 → /faces/Planning.xhtml`                                                                                                  | `<id>` is read from the `onclick` of `a.item_2169484` ("My Schedule") |
| 6   | `GET /faces/Planning.xhtml`                                                                                 | `200` planning page                                                                                                            | schedule widget `div.schedule#form:j_idt118`                          |
| 7   | `POST /faces/Planning.xhtml` (AJAX, see below)                                                              | `200 text/xml` partial-response                                                                                                | can be repeated with other ranges, up to a whole year                 |

### Planning AJAX request

Headers: `Faces-Request: partial/ajax`, `X-Requested-With: XMLHttpRequest`.

Body = all fields of the planning form, plus:

```
javax.faces.partial.ajax=true
javax.faces.source=form:j_idt118
javax.faces.partial.execute=form:j_idt118
javax.faces.partial.render=form:j_idt118
form:j_idt118=form:j_idt118
form:j_idt118_start=1794787200000      ← epoch ms, midnight UTC
form:j_idt118_end=1795305600000        ← epoch ms, midnight UTC (exclusive)
form:offsetFuseauNavigateur=0          ← set by Aurion's JavaScript in the browser
javax.faces.ViewState=<current ViewState>
```

### Planning AJAX response

```xml
<partial-response id="j_id1"><changes>
  <update id="form:j_idt118"><![CDATA[{"events" : [ … ]}]]></update>
  <update id="j_id1:javax.faces.ViewState:0"><![CDATA[911…:729…]]></update>
</changes></partial-response>
```

Each event:

```json
{
  "id": "06b4ba90-5f72-4cca-b4c5-fe673eac7f53",
  "title": "BORDEAUX_032_SALLE_CODESIGN\nannulé sera décalé\nHuman Aspects of Management\nCOURS_TD\nMr X",
  "start": "2026-11-16T09:00:00+0100",
  "end": "2026-11-16T12:00:00+0100",
  "allDay": false,
  "editable": true,
  "className": "COURS_TD"
}
```

`title` lines: the **first** is the room and the **last three** are the subject, the kind and
the teacher. Everything in between is a free-text description that is often empty but can
span many lines (a Teams link, an address, a workshop programme). Any line can be empty: talks
and meetings have no subject (the description then acts as the title), and some events have
no room or teacher.

```text
J206_COURS                         ← room
En distanciel                      ┐
Connectez via le module sur …      ├ description (0 to n lines)
https://teams.microsoft.com/…      ┘
Innovation Management              ← subject
COURS_TD_DIST                      ← kind
Mr X                               ← teacher
```

- `className` equals the kind, except for exams: `className` is `est-epreuve` and the kind
  line reads `EXAM_SURV`.
- Observed kinds over a school year: `PROJET`, `COURS_TD`, `TP`, `ASSOCIATIF`, `EXAM_SURV`,
  `PROMO`, `TD`, `AUTO_APPR`, `CONF`, `REUNION`, `SOUTENANCE`, `COURS_TD_DIST`, `ATELIER`.
- The calendar shows a single teacher per event, even when several teach it. The others
  only appear in the event details popup, which is not scraped.
- Every event has an `end`; `allDay` was always `false`.

### Range size

A request for 2026-09-01 → 2027-05-31 (273 days) returned all events in one response
(73 kB, about 4.4 s). The scraper therefore always sends a single request; the
`AURION_MAX_RANGE_DAYS` limit (366 by default) is ours, not Aurion's.

## Expired session

Recorded by leaving the planning tab open until the session timed out:

| Request                                       | Response                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AJAX `POST /faces/Planning.xhtml` (next week) | `200 text/xml` with `<error><error-name>class javax.faces.application.ViewExpiredException</error-name>…`, and a `Set-Cookie` with a **new**, anonymous `JSESSIONID` |
| Full-page `POST /faces/Planning.xhtml`        | `500 text/html; charset=windows-1252`, "Votre session a expiré veuillez vous reconnecter."                                                                           |

Both are mapped to `SessionExpiredError`; the provider then logs in again once. A
`<redirect>` to the login page inside a partial-response is handled the same way, although
it was not observed.

## Not scraped

- **Event details** (the popup when you click an event: all teachers, "Constitutes a test",
  groups, status) come from another AJAX call (`eventSelect`).
