const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const core=require('../core.js');
const code=fs.readFileSync(path.join(__dirname,'../brief-template.js'),'utf8');
const esc=x=>String(x??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const world={Blob,Intl,URL,console};world.window=world;
world.FileReader=class { async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();} };
vm.runInNewContext(code,world);
const T=world.JMLBriefTemplate;
const field=(id,label,type='text',required=true)=>({id,label,type,required,help:''});
function fakedForm(brand,version,rows=[]){
  return {
    isConnected:true,dataset:{brand,base:String(version)},
    querySelector:()=>({dataset:{templateVersion:String(version)}}),
    querySelectorAll:()=>rows.map(x=>({dataset:{field:x.id},querySelector:selector=>({
      '.sbt-label':{value:x.label},'.sbt-type':{value:x.type},'.sbt-help':{value:x.help},'.sbt-req':{checked:x.required},
    })[selector]})),
  };
}
const b64PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX/0AAAAASUVORK5CYII=';
const file=(contents,type,name)=>Object.assign(new Blob([contents],{type}),{name});
test('two brands: save, required fields, reopen after JSON round-trip, and preserve original records',async()=>{
  const state=core.seed([], '2026-11-21');
  const a=state.brands[0],b=state.brands[1],old=core.makePost({title:'Unchanged existing post',brandId:a.id});
  state.posts.push(old);
  const original=JSON.stringify(old);
  const ctx={state,ui:{brand:a.id},C:core,e:esc,commit:async fn=>{fn(state);core.validate(state);T.validate(state);}};
  const defaultBrand={name:a.name,description:'QA A',timezone:a.timezone,primary:'#104b3c',accent:'#abac21',voice:'Warm and direct',
    logoFile:file(Buffer.from(b64PNG,'base64'),'image/png','brand.png'),
    bookFile:file('%PDF-1.4\n%%EOF','application/pdf','brand-book.pdf')};
  const aFields=[field('custom_origin','Brew origin'),field('objective','Goal','textarea',false)];
  await T.submit(ctx,fakedForm(a.id,0,aFields),defaultBrand);
  assert.equal(a.socialBriefTemplate.version,1);
  assert.equal(a.socialBriefBrand.book.name,'brand-book.pdf');
  assert.equal(b.socialBriefBrand,undefined);
  const aMarkup=T.newFields(ctx);
  assert.ok(aMarkup.indexOf('Brew origin')<aMarkup.indexOf('Goal'));
  assert.match(aMarkup,/Warm and direct/);
  assert.match(aMarkup,/Download brand book/);
  const p=core.makePost({title:'A post',brandId:a.id});
  const form=fakedForm(a.id,1);
  assert.throws(()=>T.start(ctx,p,form,{social_custom_origin:'  '}),/Complete the required field: Brew origin/);
  T.start(ctx,p,form,{social_custom_origin:'Guatemala',social_objective:'Consideration'});
  assert.equal(p.brief.objective,'Consideration');state.posts.push(p);
  ctx.ui.brand=b.id;
  const bFields=[field('custom_permit','Permit URL','url')];
  const second={name:b.name,description:'QA B',timezone:b.timezone,primary:'#143769',accent:'#f1ab00',voice:'Technical and calm'};
  await T.submit(ctx,fakedForm(b.id,0,bFields),second);
  const bMarkup=T.newFields(ctx);
  assert.match(bMarkup,/Permit URL/);assert.doesNotMatch(bMarkup,/Brew origin|Download brand book|Warm and direct/);
  const q=core.makePost({title:'B post',brandId:b.id});
  assert.throws(()=>T.start(ctx,q,fakedForm(b.id,1),{social_custom_permit:'ftp://example.com'}),/valid value/);
  T.start(ctx,q,fakedForm(b.id,1),{social_custom_permit:'https://example.com/proof'});state.posts.push(q);
  const plannerDraft=core.makePost({title:'Calendar draft',brandId:b.id});T.adopt(state,plannerDraft);
  assert.match(T.missing(plannerDraft)[0],/Permit URL/);state.posts.push(plannerDraft);
  ctx.ui.brand=a.id;
  const newAFields=[field('custom_origin','Brew region', 'text',false)];
  await T.submit(ctx,fakedForm(a.id,1,newAFields),{...defaultBrand,logoFile:undefined,bookFile:undefined});
  assert.equal(a.socialBriefTemplate.version,2);
  assert.throws(()=>T.start(ctx,core.makePost({brandId:a.id}),form,{social_custom_origin:'old'}),/template changed/);
  const revised=T.update(p,{social_custom_origin:'Costa Rica',social_objective:'Updated objective'});
  core.saveBrief(p,{brief:revised},'Test editor');
  assert.equal(p.briefRevision,2);
  const restored=JSON.parse(JSON.stringify(state));core.validate(restored);T.validate(restored);
  assert.equal(JSON.stringify(restored.posts[0]),original);
  assert.equal(restored.posts[1].brief.socialTemplate.fields[0].label,'Brew origin');
  assert.equal(restored.posts[1].brief.socialTemplate.answers.custom_origin,'Costa Rica');
  assert.equal(restored.posts[2].brief.socialTemplate.answers.custom_permit,'https://example.com/proof');
  assert.match(T.editFields({...ctx,state:restored},restored.posts[1]),/Brew origin/);
  assert.equal(restored.brands.find(x=>x.id===a.id).socialBriefBrand.logo.name,'brand.png');
  restored.posts[1].brief.socialTemplate.brandId=b.id;
  assert.throws(()=>T.validate(restored),/Invalid brand template snapshot/);
});
test('duplicates, wrong active brand, and invalid logo are rejected before commit',async()=>{
  const state=core.seed([], '2026-11-21'),[brand,other]=state.brands;
  const ctx={state,ui:{brand:brand.id},C:core,e:esc,commit:async()=>assert.fail('must not commit')};
  const data={name:brand.name,description:'',timezone:brand.timezone,primary:'#104b3c',accent:'#abac21',voice:'Voice'};
  await assert.rejects(T.submit(ctx,fakedForm(other.id,0,[field('custom_a','A')]),data),/active brand/);
  await assert.rejects(T.submit(ctx,fakedForm(brand.id,0,[field('custom_a','A'),field('custom_b','a')]),data),/unique/);
  await assert.rejects(T.submit(ctx,fakedForm(brand.id,0,[field('custom_a','A')]),{...data,logoFile:file('<svg>bad</svg>','image/png','fake.png')}),/valid PNG/);
});
