addEventListener("fetch", async (event) => event.respondWith(await handleRequest(event.request)));

const authToken=Deno.env.get('AUTH_TOKEN') || "";
const medAuthToken=Deno.env.get('MED_AUTH_TOKEN') || "";
const rsp401=new Response(null, {status: 401});
const rsp200=new Response(null);
const appStartupTS=new Date();
const fontFamily='Quicksand';
let followers:number=0;
let stats:Record<string, number>={};
stats=await getStats();

async function handleRequest(req:Request):Promise<Response> {
    const u=new URL(req.url);
    const token=u.searchParams.get('token');
    if(!token || token!==authToken)
        return rsp401;
    if(u.searchParams.has('getViews'))
        return new Response(await getTodayViews(u.searchParams.get('prevTS'), u.searchParams.get('currTS')));
    const newStats=await getStats();
    const diffStats=calculateDiff(newStats);
    stats=await getStats();
    return new Response(getHtml(diffStats), {
        headers: {
            'content-type': 'text/html',
            'cache-control': 'no-cache; no-store; max-age=0'
        }
    });

}

async function getStats():Promise<Record<string, number>> {
    const limit='100', filter='not-response';
    const s:Record<string, number>={};
    let to;
    while(1) {
        const qs=new URLSearchParams({
            limit,
            filter
        });
        if(to)
            qs.set('to', to);
        const res=await fetch("https://medium.com/@choubey/stats?"+qs.toString(), {
            headers: {
                'Accept': 'application/json',
                'Cookie': medAuthToken
            }
        });
        const resBody=await res.text();
        let resJson;
        try {
            resJson=JSON.parse(resBody.split("</x>")[1]);
        } catch(err) {
            return s;
        }
        if(!resJson || !resJson.payload || !resJson.payload.value)
            return s;
        for(const i of resJson.payload.value)
            s[i.title]=i.views;
        for(const k in resJson.payload.references.Collection)
            followers=resJson.payload.references.Collection[k].metadata.followerCount;
        if(resJson.payload.paging.next)
            to=resJson.payload.paging.next.to;
        else
            break;
    }
    return s;
}



function sortData(data:Record<string, number>) {
    return Object.entries(data)
        .sort(([,a],[,b]) => b-a)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
}

function calculateDiff(newStats:Record<string, number>) {
    const diffStats:Record<string, number>={};
    for(const s in newStats) {
        const diff=newStats[s]-stats[s]||0;
        if(diff>0)
            diffStats[s]=diff;
    }
    const sortedDiffStats:Record<string, number> = sortData(diffStats);
    return sortedDiffStats;
}

function getLocalTime(d:Date) {
    return d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
}

async function getTodayViews(prevTS:string|null, currTS: string|null):Promise<string> {
    if(!(prevTS && currTS))
        return '0';
    const url="https://medium.com/@choubey/stats/total/"+prevTS+"/"+currTS;
    const res=await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Cookie': medAuthToken
        }
    });
    const resBody=await res.text();
    const resJson=JSON.parse(resBody.split("</x>")[1]);
    if(!resJson || !resJson.payload || !resJson.payload.value)
        return '0';
    let views=0;
    for(const v of resJson.payload.value)
        views+=v.views;
    return views.toString();
}

function getScriptToFetchViews() {
    return `
    const d=new Date();
    d.setHours(0, 0, 0, 0);
    const prevTS=d.valueOf();
    fetch(window.location+'&prevTS='+prevTS+'&currTS='+Date.now()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('lviews').innerHTML=v
        });
    });`;
}

function getTable(d:Record<string, number>, n:number=-1) {
    let ret='<table class="minimalistBlack">', count=0;
    for(const k in d) {
        count++;
        if(n>0 && count>n)
            break;
        ret+=`<tr>
        <td>${k}</td>
        <td>${d[k]}</td>
        </tr>`;
    }
    ret+='</table>';
    return ret;
}

function getTotalViews() {
    let views=0;
    for(const k in stats)
        views+=stats[k];
    return views;
}

function getHtml(diffStats:Record<string, number>) {
    let newViews=0;
    for(const k in diffStats)
        newViews+=diffStats[k];
    let ret=`<html>
    <head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=${fontFamily}">
    <style>
    ${getCSS()}
    </style>
    <script>
    ${getScriptToFetchViews()}
    </script>
    <body>
    <p>Last updated: ${getLocalTime(new Date())}</p>
    <p>App started at: ${getLocalTime(appStartupTS)}</p>
    <p class='followers'>Followers: ${followers}</p>
    <p class="views">Today's views: <label id="lviews">0</label></p>
    <p class='newViews'>${newViews} new views since last refresh</p>
    ${getTable(diffStats)}
    <p class="allArticles">Stats of last 10 articles</p>
    ${getTable(stats, 10)}
    <p class="allArticles">All articles</p>
    <p>Total articles: ${Object.keys(stats).length}, Total views: ${getTotalViews()}</p>
    ${getTable(sortData(stats))}
    </body>
    </html>`;
    return ret;
}

function getCSS():string {
    return `    
    .followers {
        font-family: ${fontFamily};
        font-size: 4em;
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
    table.minimalistBlack {
        border: 3px solid #000000;
        width: 75%;
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
    `;
}
