```javascript
const responseLogRed = await fetch("https://aurion.junia.com/login", {
    redirect: "manual",
    method: "POST",
    body: `username=${token.username}&password=${token.password}&j_idt28=`,
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
    },
});
const cookie = await responseLogRed.headers.get("set-cookie").split(";")[0];

const responseLog = await fetch("https://aurion.junia.com/", {
    redirect: "manual",
    headers: {
        Cookie: cookie,
    },
});
const loginBody = await responseLog.text();
const $login = cheerio.load(loginBody);
const viewState = $login("input[name='javax.faces.ViewState']").val();

// Planning
await fetch("https://aurion.junia.com/faces/MainMenuPage.xhtml", {
    redirect: "manual",
    method: "POST",
    headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `form=form&javax.faces.ViewState=${viewState}&form%3Asidebar=form%3Asidebar&form%3Asidebar_menuid=0`,
});

const responsePlan = await fetch(
    "https://aurion.junia.com/faces/Planning.xhtml",
    {
        redirect: "manual",
        headers: {
            Cookie: cookie,
        },
    }
);
const planningBody = await responsePlan.text();
const $planning = cheerio.load(planningBody);
const schedule_idt = $planning("div.schedule").attr("id");

const responseEvent = await fetch(
    "https://aurion.junia.com/faces/Planning.xhtml",
    {
        redirect: "manual",
        method: "POST",
        headers: {
            Cookie: cookie,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept-Language": "fr-FR,fr;q=0.5",
            "Faces-Request": "partial/ajax",
        },
        body: `javax.faces.partial.render=${schedule_idt}&${schedule_idt}=${schedule_idt}&${schedule_idt}_start=${start}&${schedule_idt}_end=${end}`,
    }
);
const agendaBody = await responseEvent.text();
const $agenda = cheerio.load(agendaBody);
const agenda = JSON.parse(
    $(`update[id='${schedule_idt}']`)
        .html()
        .replace('<![CDATA[{"events" : ', "")
        .replace('<!--[CDATA[{"events" : ', "")
        .replace("}]]>", "")
        .replace("}]]-->", "")
);
```
