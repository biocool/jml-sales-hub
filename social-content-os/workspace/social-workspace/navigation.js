/* Shared navigation for the workspace and its embedded planner. */
(function(root){
  'use strict';
  const client=ui=>['client','viewer'].includes(ui.role);
  const base={
    plan:[['foundation','Foundation'],['research','Research'],['strategy','Strategy & KPIs'],['calendar','Calendar'],['schedule','Schedule list'],['import','Bulk import']],
    studio:[['board','Production board'],['library','Content library']],
    review:[['internal','Internal QA'],['client','Client decisions'],['planning','Planning decisions']],
    publish:[['desk','Publishing desk'],['packages','Packages & earlier log']],
    learn:[['results','Results & growth'],['observations','Earlier observations']],
    accounts:[['list','Accounts'],['people','People & access'],['brief-template','Brief template']]
  };
  const detail=[['brief','Brief & copy'],['workflow','Production workflow'],['versions','Creative versions'],['requests','Media requests'],['history','Version history']];
  const titles={workflow:'Workflow views',tools:'Planning tools',reports:'Planner reports',settings:'Planner settings'};
  const definitions=[['today','Today','home'],['plan','Content Planner','calendar'],['studio','Studio','files'],['review','Review','review'],['publish','Publish','publish'],['learn','Learn','chart']];
  function permitted(ctx,route,section=''){return (!client(ctx.ui)||['today','review','learn'].includes(route))&&(!root.JMLGovernance||root.JMLGovernance.routeAllowed(ctx.state,ctx.ui,route,section));}
  function sections(ctx,route){
    if(client(ctx.ui))return route==='review'?[['client','Creative approvals'],['planning','Plan approvals'],['inputs','Requested inputs']]:[];
    return (base[route]||[]).filter(([id])=>permitted(ctx,route,id));
  }
  function current(ctx,route){
    const ui=ctx.ui;
    if(route==='studio'&&ui.route==='content')return 'content';
    if(route==='review'&&ui.post&&ctx.state.posts.some(p=>p.id===ui.post))return 'client';
    if(route==='plan'&&(root.JMLPlanner?.sections||[]).some(s=>s.key===ui.section))return ui.section;
    const list=sections(ctx,route);return list.some(([id])=>id===ui.section)?ui.section:(route==='plan'?'calendar':list[0]?.[0]||'');
  }
  function activate(ctx,expanded){
    const route=ctx.ui.route==='content'?'studio':ctx.ui.route;expanded.add(route);
    const item=(root.JMLPlanner?.sections||[]).find(s=>s.key===current(ctx,'plan'));
    if(route==='plan'&&item?.group&&item.group!=='core')expanded.add('plan-'+item.group);
  }
  function leaf(ctx,route,id,label,selected,extra=''){
    return '<a class="nav-child '+(selected?'active':'')+'" href="#'+route+'/'+id+'" '+(selected?'aria-current="page"':'')+' '+extra+'>'+ctx.e(label)+'</a>';
  }
  function group(ctx,expanded,route,label,icon){
    const ui=ctx.ui,active=(ui.route==='content'?'studio':ui.route)===route,selected=current(ctx,route),list=sections(ctx,route),open=expanded.has(route),e=ctx.e;
    let children=list.map(([id,text])=>leaf(ctx,route,id,text,active&&selected===id)).join('');
    if(route==='plan'){
      const native=(root.JMLPlanner?.sections||[]).filter(s=>s.key!=='calendar'&&permitted(ctx,'plan',s.key));
      for(const [category,title]of Object.entries(titles)){
        const items=native.filter(s=>s.group===category);if(!items.length)continue;
        const key='plan-'+category,opened=expanded.has(key);
        children+='<div class="nav-subgroup"><button class="nav-subgroup-toggle" type="button" data-nav-toggle="'+key+'" aria-expanded="'+opened+'" aria-controls="submenu-'+key+'"><span>'+title+'</span>'+ctx.icon('down')+'</button><div class="nav-nested" id="submenu-'+key+'" '+(!opened?'hidden':'')+'>'+items.map(s=>leaf(ctx,'plan',s.key,s.label,active&&selected===s.key)).join('')+'</div></div>';
      }
      children+=native.filter(s=>!s.group||s.group==='core').map(s=>leaf(ctx,'plan',s.key,s.label,active&&selected===s.key)).join('');
    }
    if(route==='studio'&&ui.route==='content'){
      const p=ctx.state.posts.find(p=>p.id===ui.post);if(p)children+='<div class="nav-record"><span class="nav-record-caption">Current content</span><strong title="'+e(p.title)+'">'+e(p.externalId||p.title)+'</strong>'+detail.map(([id,text])=>leaf(ctx,'content',encodeURIComponent(p.id)+'/'+id,text,ui.tab===id)).join('')+'</div>';
    }
    if(!children)return '<a class="nav-link '+(active?'active':'')+'" href="#'+route+'" '+(active?'aria-current="page"':'')+'>'+ctx.icon(icon)+'<span>'+label+'</span></a>';
    const destination='#'+route+'/'+(route==='plan'?'calendar':list[0]?.[0]||'');
    return '<section class="nav-group '+(active?'current-group':'')+'"><div class="nav-row"><a class="nav-link" href="'+destination+'">'+ctx.icon(icon)+'<span>'+label+'</span></a><button type="button" class="nav-toggle" data-nav-toggle="'+route+'" aria-label="'+(open?'Collapse ':'Expand ')+label+' sections" aria-expanded="'+open+'" aria-controls="submenu-'+route+'">'+ctx.icon('down')+'</button></div><div class="nav-children" id="submenu-'+route+'" '+(!open?'hidden':'')+'>'+children+'</div></section>';
  }
  function main(ctx,expanded){return '<nav aria-label="Workspace sections">'+definitions.filter(([route])=>permitted(ctx,route)).map(([route,label,icon])=>group(ctx,expanded,route,label,icon)).join('')+'</nav>';}
  function bottom(ctx,expanded){if(client(ctx.ui))return '';return '<div class="sidebar-bottom">'+group(ctx,expanded,'accounts','Client accounts','settings')+'<a class="nav-link '+(ctx.ui.route==='resources'?'active':'')+'" href="#resources" '+(ctx.ui.route==='resources'?'aria-current="page"':'')+'>'+ctx.icon('files')+'<span>Resources</span></a>'+(root.JMLGovernance?.can(ctx.state,ctx.ui,'backup')?'<button class="sidebar-memory" data-action="data">'+ctx.icon('database')+'Memory & backups</button>':'')+'</div>';}
  const api={sections,current,activate,main,bottom,detail};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JMLNavigation=api;
})(typeof window==='undefined'?globalThis:window);
