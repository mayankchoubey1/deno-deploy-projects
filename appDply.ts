import { serve } from "https://deno.land/std/http/server.ts";

const authToken = Deno.env.get("AUTH_TOKEN") || "";
const medAuthToken = Deno.env.get("MED_AUTH_TOKEN") || "";
const rsp401 = new Response(null, { status: 401 });
const fontFamily = "Sora";
let followers: number = 0, unreadNotifications: number = 0;
let stats: Record<string, any> = {};
stats = await getStats();
let startupStats: Record<string, any> = {};
startupStats = JSON.parse(JSON.stringify(stats));
const startupTS = Date.now();
const twitterFollowers = await getTwitterFollowers();

async function getTwitterFollowers() {
  const res = await fetch(
    "https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=deno_land",
  );
  if(res.status === 200) {
    const resJson = await res.json();
    return resJson[0]["followers_count"];
  }
  return 0;
}

async function handleRequest(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const token = u.searchParams.get("token");
  if (!token || token !== authToken) {
    return rsp401;
  }
  if (u.searchParams.has("getViews")) {
    return new Response(
      await getTodayViews(
        u.searchParams.get("prevTS"),
        u.searchParams.get("currTS"),
      ),
    );
  }
  if (u.searchParams.has("getFollowers")) {
    return new Response(await getFollowers());
  }
  if (u.searchParams.has("getUnreadNotifications")) {
    return new Response(`${await getUnreadNotifications()}`);
  }
  const newStats = await getStats();
  const diffStats = calculateDiff(newStats, stats);
  const diffStatsStartup = calculateDiff(newStats, startupStats);
  stats = newStats;
  return new Response(await getHtml(diffStats, diffStatsStartup), {
    headers: {
      "content-type": "text/html",
      "cache-control": "no-cache; no-store; max-age=0",
    },
  });
}

async function getHtml(
  diffStats: Record<string, number>,
  diffStatsStartup: Record<string, number>,
) {
  let newViews = 0;
  for (const k in diffStats) {
    newViews += diffStats[k];
  }

  let newViewsSinceStartup = 0;
  for (const k in diffStatsStartup) {
    newViewsSinceStartup += diffStatsStartup[k];
  }

  const elapsedMinsSinceStartup = Math.round(
    Number(((Date.now() - startupTS) / 1000) / 60),
  );

  let ret = `<html>
    <head>
    <meta name=”viewport” content=”width=device-width, initial-scale=1.0″>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=${fontFamily}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <style>
    ${getCSS()}
    </style>
    <script src="https://use.fontawesome.com/a3bd6a1ec7.js"></script>
    <body>
    <p><i class="fa-solid fa-4x fa-eye">&nbsp;</i><label id="lviews" class="todayViews">0</label>
    &nbsp;<label id="estviews" class="notificationsNumber">(0)</label></p>
    <br>
    <p><i class="fa-solid fa-4x fa-user-group">&nbsp;</i><label id="followers" class="followerNumber">0</label></p>
    <br>
    <p><i class="fa-solid fa-3x fa-bell">&nbsp;</i><label id="unreadNotifications" class="notificationsNumber">0</label></p>
    <br>
    <p><i class="fa-brands fa-2x fa-twitter">&nbsp;</i><label class="smallestNumber">${twitterFollowers}</label></p>
    <br>
    <p><i class="fa-solid fa-2x fa-calendar-days"></i>&nbsp;
    <label id="y1views" class="smallestNumber">0</label>,&nbsp;
    <label id="y2views" class="smallestNumber">0</label>,&nbsp;
    <label id="y3views" class="smallestNumber">0</label>,&nbsp;
    <label id="y4views" class="smallestNumber">0</label>,&nbsp;
    <label id="y5views" class="smallestNumber">0</label>&nbsp;</p>
    <br>
    <p><i class="fas fa-list fa-2x">&nbsp;</i><label class="smallestNumber">${
    Object.keys(stats).length
  }</label></p>
    <br>
    <p><i class="fas fa-binoculars fa-2x">&nbsp;</i><label class="smallestNumber">${getTotalViews()}</label></p>
    <script>
    ${getScriptToFetchViews()}
    </script>
    <script>
    ${getScriptToFetchPastViews()}
    </script>
    <script>
    ${getScriptToFetchFollowers()}
    </script>
    <script>
    ${getScriptToFetchUnreadNotifications()}
    </script>
    <p class='views'><label class="bigNumber">
    ${newViews}</label>&nbsp;new views since last refresh</p>
    ${getTableDiff(diffStats)}
    </body>
    </html>`;

  /*
    <p class='views'><label class="bigNumber">${newViews}</label>&nbsp;new views</p>
    ${getTableDiff(diffStats)}
    <p class="allArticles">Detailed stats</p>
    <p>Total articles: ${
    Object.keys(stats).length
  }, Total views: ${getTotalViews()}</p>
    ${getTable(stats)}
    </body>
    </html>`;*/
  return ret;
}

async function getFollowers() {
  const limit = "1", filter = "not-response";
  const qs = new URLSearchParams({
    limit,
    filter,
  });
  const res = await fetch(
    "https://medium.com/@choubey/stats?" + qs.toString(),
    {
      headers: {
        "Accept": "application/json",
        "Cookie": medAuthToken,
      },
    },
  );
  const resBody = await res.text();
  let resJson;
  try {
    resJson = JSON.parse(resBody.split("</x>")[1]);
  } catch (err) {
    return 0;
  }
  if (
    !resJson || !resJson.payload || !resJson.payload.references ||
    !resJson.payload.references.Collection
  ) {
    return 0;
  }
  for (const k in resJson.payload.references.Collection) {
    return resJson.payload.references.Collection[k].metadata.followerCount;
  }
  return 0;
}

function getLocalTime(d: Date) {
  return d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
}

async function getTodayViews(
  prevTS: string | null,
  currTS: string | null,
): Promise<string> {
  if (!(prevTS && currTS)) {
    return "0";
  }
  const url = "https://medium.com/@choubey/stats/total/" + prevTS + "/" +
    currTS;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "Cookie": medAuthToken,
    },
  });
  const resBody = await res.text();
  const resJson = JSON.parse(resBody.split("</x>")[1]);
  if (!resJson || !resJson.payload || !resJson.payload.value) {
    return "0";
  }
  let views = 0;
  for (const v of resJson.payload.value) {
    views += v.views;
  }
  return views.toString();
}

async function getUnreadNotifications(): Promise<number> {
  const url = "https://medium.com/_/api/activity-status";
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "Cookie": medAuthToken,
    },
  });
  const resBody = await res.text();
  let resJson;
  try {
    resJson = JSON.parse(resBody.split("</x>")[1]);
    if (!resJson || !resJson.payload || !resJson.payload) {
      return 0;
    }
  } catch (e) {
    return 0;
  }
  return resJson.payload.unreadActivityCount;
}

function getScriptToFetchViews() {
  return `
    const d=new Date();
    d.setHours(0, 0, 0, 0);
    const prevTS=d.valueOf();
    document.getElementById('lviews').innerHTML="0";
    document.getElementById('estviews').innerHTML="(0)";
    fetch(window.location+'&prevTS='+prevTS+'&currTS='+Date.now()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('lviews').innerHTML=v;
            const i=new Date(), j=new Date(i);
            const m=Math.floor((j - i.setHours(0,0,0,0))/1000/60);
            const vs=Number(v);
            const r=1440-m;
            document.getElementById('estviews').innerHTML="("+Math.floor((v/m)*r+vs)+")";
        });
    });`;
}

function getScriptToFetchPastViews() {
  return `
    const d1=new Date();
    d1.setHours(0, 0, 0, 0);
    const p1=new Date(d);
    p1.setHours(p1.getHours() - 24);
    const p2=new Date(p1);
    p2.setHours(p1.getHours() - 24);
    const p3=new Date(p2);
    p3.setHours(p2.getHours() - 24);
    const p4=new Date(p3);
    p4.setHours(p3.getHours() - 24);
    const p5=new Date(p4);
    p5.setHours(p4.getHours() - 24);
    document.getElementById('y1views').innerHTML="0";
    document.getElementById('y2views').innerHTML="0";
    document.getElementById('y3views').innerHTML="0";
    document.getElementById('y4views').innerHTML="0";
    document.getElementById('y5views').innerHTML="0";
    fetch(window.location+'&prevTS='+p1.valueOf()+'&currTS='+d1.valueOf()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('y1views').innerHTML=v;
        });
    });
    fetch(window.location+'&prevTS='+p2.valueOf()+'&currTS='+p1.valueOf()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('y2views').innerHTML=v;
        });
    });
    fetch(window.location+'&prevTS='+p3.valueOf()+'&currTS='+p2.valueOf()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('y3views').innerHTML=v;
        });
    });
    fetch(window.location+'&prevTS='+p4.valueOf()+'&currTS='+p3.valueOf()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('y4views').innerHTML=v;
        });
    });
    fetch(window.location+'&prevTS='+p5.valueOf()+'&currTS='+p4.valueOf()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('y5views').innerHTML=v;
        });
    });
    `;
}

function getScriptToFetchFollowers() {
  return `
      document.getElementById('followers').innerHTML="0";
      fetch(window.location+'&getFollowers').then(d=>{
          d.text().then(v=>{
            document.getElementById('followers').innerHTML=v
          });
      });`;
}

function getScriptToFetchUnreadNotifications() {
  return `
      document.getElementById('unreadNotifications').innerHTML="0";
      fetch(window.location+'&getUnreadNotifications').then(d=>{
          d.text().then(v=>{
            document.getElementById('unreadNotifications').innerHTML=v
          });
      });`;
}

function getTable(d: Record<string, any>, n: number = -1) {
  let ret = '<table class="minimalistBlack">', count = 0;
  for (const k in d) {
    const v: number = d[k].views,
      r: number = d[k].reads,
      c: number = d[k].claps;
    count++;
    if (n > 0 && count > n) {
      break;
    }
    ret += `<tr>
        <td>${k}</td>
        <td><label class="smallestNumber">${v}</label>,${r},${c}</td>
        </tr>`;
  }
  ret += "</table>";
  return ret;
}

function getTableDiff(d: Record<string, number>) {
  let ret = '<table class="minimalistBlack">', count = 0;
  for (const k in d) {
    const v: number = stats[k].views,
      r: number = stats[k].reads,
      c: number = stats[k].claps;
    ret += `<tr>
        <td>${k}</td>
        <td>${d[k]}</td>
        <td><label class="smallerNumber">${v}</label>,${r},${c}</td>
        </tr>`;
  }
  ret += "</table>";
  return ret;
}

async function getLast10ArticleStats(): Promise<Record<string, any>> {
  const limit = "10", filter = "not-response";
  const s: Record<string, any> = {};
  const qs = new URLSearchParams({
    limit,
    filter,
  });
  const res = await fetch(
    "https://medium.com/@choubey/stats?" + qs.toString(),
    {
      headers: {
        "Accept": "application/json",
        "Cookie": medAuthToken,
      },
    },
  );
  const resBody = await res.text();
  let resJson;
  try {
    resJson = JSON.parse(resBody.split("</x>")[1]);
  } catch (err) {
    return s;
  }
  if (!resJson || !resJson.payload || !resJson.payload.value) {
    return s;
  }
  for (const i of resJson.payload.value) {
    const title = i.title.replace(/[^A-Za-z0-9\s]/g, "").replace(
      /\s{2,}/g,
      " ",
    );
    s[title] = {
      views: i.views,
      reads: i.reads,
      claps: i.claps,
    };
  }
  return s;
}

function getTotalViews() {
  let views = 0;
  for (const k in stats) {
    views += stats[k].views;
  }
  return views;
}

await serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    console.log(e);
  }
  return new Response(null, { status: 500 });
});

async function getStats(): Promise<Record<string, any>> {
  const limit = "100", filter = "not-response";
  const s: Record<string, any> = {};
  let to;
  while (1) {
    const qs = new URLSearchParams({
      limit,
      filter,
    });
    if (to) {
      qs.set("to", to);
    }
    const res = await fetch(
      "https://medium.com/@choubey/stats?" + qs.toString(),
      {
        headers: {
          "Accept": "application/json",
          "Cookie": medAuthToken,
        },
      },
    );
    const resBody = await res.text();
    let resJson;
    try {
      resJson = JSON.parse(resBody.split("</x>")[1]);
    } catch (err) {
      return s;
    }
    if (!resJson || !resJson.payload || !resJson.payload.value) {
      return s;
    }
    for (const i of resJson.payload.value) {
      s[i.title] = {
        views: i.views,
        reads: i.reads,
        claps: i.claps,
      };
    }
    for (const k in resJson.payload.references.Collection) {
      followers =
        resJson.payload.references.Collection[k].metadata.followerCount;
    }
    if (resJson.payload.paging.next) {
      to = resJson.payload.paging.next.to;
    } else {
      break;
    }
  }
  unreadNotifications = await getUnreadNotifications();
  return s;
}

function sortData(data: Record<string, number>) {
  return Object.entries(data)
    .sort(([, a], [, b]) => b - a)
    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
}

function calculateDiff(
  newStats: Record<string, any>,
  stats: Record<string, any>,
) {
  const diffStats: Record<string, number> = {};
  if (!Object.keys(stats).length) {
    return diffStats;
  }
  for (const s in newStats) {
    if (!stats[s]) {
      diffStats[s] = newStats[s].views;
    } else {
      const diff = newStats[s].views - stats[s].views || 0;
      if (diff > 0) {
        diffStats[s] = diff;
      }
    }
  }
  const sortedDiffStats: Record<string, number> = sortData(diffStats);
  return sortedDiffStats;
}

function getCSS(): string {
  return `
    .todayViews {
        font-family: ${fontFamily};
        font-size: 6em;
    }
      .followerNumber {
          font-family: ${fontFamily};
          font-size: 4.5em;
      }
      .notificationsNumber {
          font-family: ${fontFamily};
          font-size: 3em;
      }
      .followers {
          font-family: ${fontFamily};
          font-size: 5em;
      }
      .tfollowers {
          font-family: ${fontFamily};
          font-size: 2em;
      }
      p {
          font-family: ${fontFamily};
          font-size: 1.5em;
      }
      .views{
          font-family: ${fontFamily};
          font-size: 4em;
      }
      .newViews{
          font-family: ${fontFamily};
          font-weight: bold;
          font-size: 4em;
      }
      .allArticles{
          font-family: ${fontFamily};
          font-weight: bold;
          font-size: 4em;
      }
      .smallerNumber{
          font-family: ${fontFamily};
          font-weight: bold;
          font-size: 1.5em;
      }
      .smallestNumber{
          font-family: ${fontFamily};
          font-weight: bold;
          font-size: 2em;
      }
      .bigNumber{
          font-family: ${fontFamily};
          font-weight: bold;
          font-size: 1.25em;
      }
      .biggerNumber{
          font-family: ${fontFamily};
          font-weight: bold;
          font-size: 1.5em;
      }
      .biggestNumber{
          font-family: ${fontFamily};
          font-weight: bold;
          font-size: 2em;
      }
      table.minimalistBlack {
          border: 3px solid #000000;
          width: 100%;
          text-align: left;
          border-collapse: collapse;
      }
      table.minimalistBlack td, table.minimalistBlack th {
          border: 1px solid #000000;
          padding: 5px 4px;
      }
      table.minimalistBlack tbody td {
          font-family: ${fontFamily};
          font-size: 3em;
      }
      table.minimalistBlack thead {
          background: #CFCFCF;
          background: -moz-linear-gradient(top, #dbdbdb 0%, #d3d3d3 66%, #CFCFCF 100%);
          background: -webkit-linear-gradient(top, #dbdbdb 0%, #d3d3d3 66%, #CFCFCF 100%);
          background: linear-gradient(to bottom, #dbdbdb 0%, #d3d3d3 66%, #CFCFCF 100%);
          border-bottom: 3px solid #000000;
      }
      table.minimalistBlack thead th {
          font-size: 15px;
          font-weight: bold;
          color: #000000;
          text-align: left;
      }
      table.minimalistBlack tfoot {
          font-size: 14px;
          font-weight: bold;
          color: #000000;
          border-top: 3px solid #000000;
      }
      table.minimalistBlack tfoot td {
          font-size: 14px;
      }
      .numberCell {
          text-align: right,
          width: 30%
      }
      .iconCell {
          text-align: right,
          width: 30%
      }
      `;
}
