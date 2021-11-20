import { serve } from "https://deno.land/std/http/server.ts";

const authToken=Deno.env.get('AUTH_TOKEN') || "";
const medAuthToken=Deno.env.get('MED_AUTH_TOKEN') || "";
const rsp401=new Response(null, {status: 401});
const rsp200=new Response(null);
const appStartupTS=new Date();
const fontFamily='Manrope';
let followers:number=0, unreadNotifications:number=0;
let stats:Record<string, any>={};
stats=await getStats();
const twitterFollowers=await getTwitterFollowers();

async function getTwitterFollowers() {
    const res=await fetch('https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=deno_land');
    const resJson=await res.json();
    return resJson[0]['followers_count'];
}

async function handleRequest(req:Request):Promise<Response> {
    const u=new URL(req.url);
    const token=u.searchParams.get('token');
    if(!token || token!==authToken)
        return rsp401;
    if(u.searchParams.has('getViews'))
        return new Response(await getTodayViews(u.searchParams.get('prevTS'), u.searchParams.get('currTS')));
    const newStats=await getStats();
    const diffStats=calculateDiff(newStats);
    stats=newStats;
    return new Response(getHtml(diffStats), {
        headers: {
            'content-type': 'text/html',
            'cache-control': 'no-cache; no-store; max-age=0'
        }
    });

}

async function getStats():Promise<Record<string, any>> {
    const limit='100', filter='not-response';
    const s:Record<string, any>={};
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
            s[i.title]={
                views: i.views,
                reads: i.reads,
                claps: i.claps
            };
        for(const k in resJson.payload.references.Collection)
            followers=resJson.payload.references.Collection[k].metadata.followerCount;
        if(resJson.payload.paging.next)
            to=resJson.payload.paging.next.to;
        else
            break;
    }
    unreadNotifications=await getUnreadNotifications();
    return s;
}



function sortData(data:Record<string, number>) {
    return Object.entries(data)
        .sort(([,a],[,b]) => b-a)
        .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
}

function calculateDiff(newStats:Record<string, any>) {
    const diffStats:Record<string, number>={};
    for(const s in newStats) {
        const diff=newStats[s].views-stats[s].views||0;
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

async function getUnreadNotifications():Promise<number> {
    const url="https://medium.com/_/api/activity-status";
    const res=await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Cookie': medAuthToken
        }
    });
    const resBody=await res.text();
    let resJson;
    try {
        resJson=JSON.parse(resBody.split("</x>")[1]);
        if(!resJson || !resJson.payload || !resJson.payload)
            return 0;
    } catch(e) {
        return 0;
    }
    return resJson.payload.unreadActivityCount;
}

function getScriptToFetchViews() {
    return `
    const d=new Date();
    d.setHours(0, 0, 0, 0);
    const prevTS=d.valueOf();
    fetch(window.location+'&prevTS='+prevTS+'&currTS='+Date.now()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('lviews').innerHTML=v;
            const i=new Date(), j=new Date(i);
            const m=Math.floor((j - i.setHours(0,0,0,0))/1000/60);
            const vs=Number(v);
            const r=1440-m;
            document.getElementById('estviews').innerHTML=Math.floor((v/m)*r+vs);
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
    fetch(window.location+'&prevTS='+p1.valueOf()+'&currTS='+d1.valueOf()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('yviews').innerHTML=v;
        });
    });
    fetch(window.location+'&prevTS='+p2.valueOf()+'&currTS='+p1.valueOf()+'&getViews').then(d=>{
        d.text().then(v=>{
            document.getElementById('yyviews').innerHTML=v;
        });
    });
    `;
}

function getScriptToResetStats() {
    return `
    function resetStats() {
        fetch(window.location+'&reset').then(d=>{
            window.location.reload();
        });
    }
    `;
}

function getTable(d:Record<string, any>, n:number=-1) {
    let ret='<table class="minimalistBlack">', count=0;
    for(const k in d) {
        const v:number=d[k].views, r:number=d[k].reads, c:number=d[k].claps;
        count++;
        if(n>0 && count>n)
            break;
        ret+=`<tr>
        <td>${k}</td>
        <td><label class="smallestNumber">${v}</label>,${r},${c}</td>
        </tr>`;
    }
    ret+='</table>';
    return ret;
}

function getTableDiff(d:Record<string, number>) {
    let ret='<table class="minimalistBlack">', count=0;
    for(const k in d) {
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
        views+=stats[k].views;
    return views;
}

function getHtml(diffStats:Record<string, number>) {
    let newViews=0;
    for(const k in diffStats)
        newViews+=diffStats[k];
    let ret=`<html>
    <head>
    <meta name=”viewport” content=”width=device-width, initial-scale=1.0″>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=${fontFamily}">
    <style>
    ${getCSS()}
    </style>
    <script>
    ${getScriptToFetchViews()}
    </script>
    <script>
    ${getScriptToFetchPastViews()}
    </script>
    <script>
    ${getScriptToResetStats()}
    </script>
    <body>
    <p>Last updated: ${getLocalTime(new Date())}</p>
    <p>App started at: ${getLocalTime(appStartupTS)}</p>
    <p class="views"><label id="lviews" class="biggestNumber">0</label>&nbsp;views today&nbsp;(est:<label id="estviews" class="smallestNumber">0</label>)</p>
    <p class='followers'><label class="biggerNumber">${followers}</label>&nbsp;followers</p>
    <p class="views"><label id="yviews" class="smallestNumber">0</label>,&nbsp;<label id="yyviews" class="smallestNumber">0</label>&nbsp;views in last 2 days</p>
    <p class='views'><label class="bigNumber">${unreadNotifications}</label>&nbsp;unread notifcations</p>
    <p class='views'><label class="bigNumber">${newViews}</label>&nbsp;new views</p>
    <p class='tfollowers'><label class="smallerNumber">${twitterFollowers}</label>&nbsp;twitter followers of denoland</p>
    ${getTableDiff(diffStats)}
    <p class="allArticles">Detailed stats</p>
    <p>Total articles: ${Object.keys(stats).length}, Total views: ${getTotalViews()}</p>
    ${getTable(stats)}
    </body>
    </html>`;
    return ret;
}

function getCSS():string {
    return `    
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
        font-size: 1.25em;
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

await serve(async (req:Request) => {
    try {
        return await handleRequest(req)
    } catch(e) {console.log(e)}
    return new Response(null, {status: 500});
});
