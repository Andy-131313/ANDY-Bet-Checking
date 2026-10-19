import { chromium } from 'playwright';
import { neon } from '@neondatabase/serverless';

// URL jednotlivých soutěží je záměrně konfigurovatelná: ověřte přesné
// stránky sezóny 2026/27 a rozsah povolení před aktivací plánovače.
const leagues = [
  ['PL','LIVESPORT_PL_URL'],['PD','LIVESPORT_PD_URL'],
  ['SA','LIVESPORT_SA_URL'],['FL1','LIVESPORT_FL1_URL'],
  ['BL1','LIVESPORT_BL1_URL'],['CZ1','LIVESPORT_CZ1_URL'],
];
const season='2026/27';
const dryRun=process.argv.includes('--dry-run');
const single=process.env.ONLY_LEAGUE;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function matchDate(raw) {
  // Očekáváme explicitní DD.MM. nebo DD.MM.YYYY. Žádné odhady při nejasnosti.
  const m=raw.match(/(?:^|\s)(\d{1,2})\.(\d{1,2})\.(?:(\d{4}))?/);
  if(!m)return null;
  const day=Number(m[1]),month=Number(m[2]);
  const year=m[3]?Number(m[3]):month>=7?2026:2027;
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  if(year!==2026&&year!==2027)return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function checkUrl(value,name){
  if(!value)throw Error(`Chybí ${name}; vložte schválenou URL výsledků sezóny 2026/27`);
  const u=new URL(value);
  if(u.protocol!=='https:'||!['livesport.cz','www.livesport.cz'].includes(u.hostname))throw Error(`Neplatná URL ${name}`);
  if(!u.pathname.includes('/vysledky'))throw Error(`URL ${name} musí odkazovat na stránku výsledků`);
  return u.toString();
}
async function extract(page,league,url){
  const rows=await page.locator('.event__match').evaluateAll(nodes=>nodes.map(n=>{
    const get=s=>n.querySelector(s)?.textContent?.trim()||'';
    const link=n.querySelector('a[href*="/zapas/"]')?.getAttribute('href')||'';
    // Nový vzhled Livesportu (twoLine) nemá vždy původní event__participant selektory.
    // Záložní parsování přijímá JEN pět jasných řádků:
    // DD.MM. HH:MM / domácí / hosté / góly domácích / góly hostů.
    const lines=(n.innerText||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const fallback=lines.length===5 &&
      /^\d{1,2}\.\d{1,2}\.\s+\d{1,2}:\d{2}$/.test(lines[0]) &&
      lines[1].length>1 && lines[2].length>1 &&
      /^\d+$/.test(lines[3]) && /^\d+$/.test(lines[4]);
    return {
      id:n.getAttribute('id')||'',
      home:get('.event__participant--home')||(fallback?lines[1]:''),
      away:get('.event__participant--away')||(fallback?lines[2]:''),
      date:get('.event__time')||get('.event__stageTime--date')||(fallback?lines[0]:''),
      hg:get('.event__score--home')||(fallback?lines[3]:''),
      ag:get('.event__score--away')||(fallback?lines[4]:''),
      stage:get('.event__stage'),className:n.className,link,
      rawSample:lines.slice(0,6)
    };
  }));
  const result=[];let rejected=0;
  for(const r of rows){
    const date=matchDate(r.date);
    const id=r.id.replace(/^g_\d+_/,'').trim();
    // /vysledky/ can still contain matches in progress; conservatively skip today.
    const todayPrague=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const finished=Boolean(date && date<todayPrague) &&
      !/event__match--static|event__match--scheduled|event__match--live/.test(r.className) &&
      /^\d+$/.test(r.hg)&&/^\d+$/.test(r.ag);
    // Zápasy bez ověřeného finálního stavu neukládat do trénovacích dat.
    if(!id||!date||!r.home||!r.away){rejected++;continue}
    const status=finished?'finished':'scheduled';
    result.push({source_id:`${league}:${id}`,league,season,date,home:r.home,away:r.away,status,
      hg:finished?Number(r.hg):null,ag:finished?Number(r.ag):null,
      source_url:r.link?new URL(r.link,url).toString():url});
  }
  return {rows:result,rejected,total:rows.length};
}
async function main(){
  if(!dryRun&&!process.env.DATABASE_URL)throw Error('DATABASE_URL chybí');
  const selected=leagues.filter(([code])=>!single||code===single);
  if(!selected.length)throw Error('Neplatné ONLY_LEAGUE');
  const urls=selected.map(([code,key])=>[code,checkUrl(process.env[key],key)]);
  const sql=dryRun?null:neon(process.env.DATABASE_URL);
  const browser=await chromium.launch({headless:true});
  let runId=null,imported=0;const details={};
  try{
    if(sql){
      const [run]=await sql`INSERT INTO livesport_sync_runs(status) VALUES('running') RETURNING id`;
      runId=run.id;
    }
    for(const [league,url] of urls){
      const page=await browser.newPage({locale:'cs-CZ',timezoneId:'Europe/Prague'});
      try{
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
        await page.locator('.event__match').first().waitFor({timeout:30000});
        // Stránka musí prokazatelně odpovídat vybrané sezóně.
        const text=(await page.locator('body').innerText()).slice(0,25000);
        if(!/2026\s*[\/–-]\s*2027|2026\s*[\/–-]\s*27/.test(text))
          throw Error('Na stránce není potvrzena sezóna 2026/27; import zastaven');
        for(let i=0;i<25;i++){
          const more=page.getByText(/Zobrazit více zápasů|Show more matches/i).first();
          if(!await more.isVisible().catch(()=>false))break;
          const before=await page.locator('.event__match').count();
          await more.click();await wait(1300);
          if(await page.locator('.event__match').count()<=before)break;
        }
const data=await extract(page,league,url);

// Kontrola prvních 10 zápasů při testovacím importu
if (dryRun) {
  console.log('KONTROLA ZAPASU:', JSON.stringify(
    data.rows.slice(0, 10).map(r => ({
      date: r.date,
      home: r.home,
      away: r.away,
      status: r.status,
      score: r.hg !== null && r.ag !== null
        ? `${r.hg}:${r.ag}`
        : null
    })),
    null,
    2
  ));
}

if(data.total===0||data.rows.length===0)throw Error('Nenalezeny validní zápasy; možná změna HTML');
        // Bezpečnost: vysoká míra neplatných řádků signalizuje změnu parseru.
        if(data.rejected/data.total>0.25)throw Error(`Příliš mnoho odmítnutých řádků (${data.rejected}/${data.total})`);
        let saved=0;
        for(const r of data.rows){
          if(sql){
            await sql`INSERT INTO livesport_fixtures(source_id,league,season,date,home,away,status,hg,ag,source_url)
              VALUES(${r.source_id},${r.league},${r.season},${r.date},${r.home},${r.away},${r.status},${r.hg},${r.ag},${r.source_url})
              ON CONFLICT(source_id) DO UPDATE SET date=excluded.date,home=excluded.home,away=excluded.away,
              status=excluded.status,hg=excluded.hg,ag=excluded.ag,source_url=excluded.source_url,updated_at=now()`;
            if(r.status==='finished')await sql`INSERT INTO matches(league,date,home,away,hg,ag)
              VALUES(${r.league},${r.date},${r.home},${r.away},${r.hg},${r.ag})
              ON CONFLICT(league,date,home,away) DO UPDATE SET hg=excluded.hg,ag=excluded.ag`;
          }
          saved++;
        }
        imported+=saved;
        details[league]={read:data.total,accepted:data.rows.length,rejected:data.rejected,saved};
        console.log(league,JSON.stringify(details[league]));
      } finally {await page.close()}
      await wait(1500);
    }
    if(sql)await sql`UPDATE livesport_sync_runs SET finished_at=now(),status='success',imported=${imported},details=${JSON.stringify(details)}::jsonb WHERE id=${runId}`;
    console.log(JSON.stringify({dryRun,imported,details}));
  }catch(e){
    if(sql&&runId)await sql`UPDATE livesport_sync_runs SET finished_at=now(),status='failed',imported=${imported},details=${JSON.stringify({...details,error:String(e)})}::jsonb WHERE id=${runId}`;
    throw e;
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
