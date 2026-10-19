export type Match={league:string;date:string;home:string;away:string;hg:number;ag:number};
export type Fixture=Pick<Match,'league'|'date'|'home'|'away'>;
const poisson=(k:number,l:number)=>{let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p};
export function predict(f:Fixture,all:Match[]){
 const rows=all.filter(r=>r.league===f.league&&r.date<f.date).sort((a,b)=>b.date.localeCompare(a.date));
 if(rows.length<20)throw Error('Je potřeba alespoň 20 předchozích zápasů stejné ligy.');
 const lh=rows.reduce((s,r)=>s+r.hg,0)/rows.length,la=rows.reduce((s,r)=>s+r.ag,0)/rows.length;
 const rate=(team:string,side:'home'|'away',goals:'hg'|'ag',baseline:number)=>{const x=rows.filter(r=>r[side]===team).slice(0,30);return(x.reduce((s,r)=>s+r[goals],0)+8*baseline)/(x.length+8)};
 const x=Math.max(.2,Math.min(4,lh*(rate(f.home,'home','hg',lh)/Math.max(lh,.1))*(rate(f.away,'away','hg',lh)/Math.max(lh,.1))));
 const y=Math.max(.2,Math.min(4,la*(rate(f.away,'away','ag',la)/Math.max(la,.1))*(rate(f.home,'home','ag',la)/Math.max(la,.1))));
 const p:{'1':number;'X':number;'2':number}={'1':0,'X':0,'2':0};let total=0;
 for(let i=0;i<12;i++)for(let j=0;j<12;j++){const z=poisson(i,x)*poisson(j,y);total+=z;p[i>j?'1':i===j?'X':'2']+=z}
 for(const k of ['1','X','2'] as const)p[k]/=total;
 return {probabilities:p,fairOdds:{'1':1/p['1'],X:1/p.X,'2':1/p['2']},expectedGoals:{home:x,away:y},sampleSize:rows.length,method:'Poisson with shrinkage; uncalibrated'};
}
