addEventListener("fetch", async (event) => event.respondWith(await handleRequest(event.request)));

const authToken=Deno.env.get('AUTH_TOKEN') || "";
const medAuthToken=Deno.env.get('MED_AUTH_TOKEN') || "";
const rsp401=new Response(null, {status: 401});
const rsp200=new Response(null);
const stats:Record<string, number>=await getStats();

async function handleRequest(req:Request):Promise<Response> {
    const u=new URL(req.url);
    const token=u.searchParams.get('token');
    if(!token || token!==authToken)
        return rsp401;
    if(u.searchParams.get('reset'))
        for(const k in stats)
            delete stats[k];
    const newStats=await getStats();
    const diffStats=calculateDiff(newStats);
    return new Response(getHtml(diffStats), {
        headers: {
            'content-type': 'text/html'
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
        const resJson=JSON.parse(resBody.split("</x>")[1]);
        if(!resJson || !resJson.payload || !resJson.payload.value)
            return s;
        for(const i of resJson.payload.value)
            s[i.title]=i.views;
        for(const k in resJson.payload.references.Collection)
            s['subs']=resJson.payload.references.Collection[k].metadata.followerCount;
        if(resJson.payload.paging.next)
            to=resJson.payload.paging.next.to;
        else
            break;
    }
    return s;
}

function getHtml(diffStats:Record<string, number>) {
    let ret=`<html>
    <head>
    <style>
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
        font-size: 13px;
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
    </style>
    <body>
    <table class="minimalistBlack">`;
    for(const k in diffStats)
        ret+=`<tr>
        <td>${k}</td>
        <td>${diffStats[k]}</td>
        </tr>`;
    ret+=`</table>
    </body>
    </html>`;
    return ret;
}

function calculateDiff(newStats:Record<string, number>) {
    const diffStats:Record<string, number>={};
    for(const s in newStats) {
        const diff=newStats[s]-stats[s]||0;
        if(diff>0)
            diffStats[s]=diff;
    }
    const sortedDiffStats:Record<string, number> = Object.entries(diffStats)
    .sort(([,a],[,b]) => a-b)
    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

    sortedDiffStats['subs']=newStats['subs'];
    return sortedDiffStats;
}