/* Página del negocio: menú, pedido para recoger y asistente. Usa el núcleo de nexa.js. */
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id)};
  function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e }
  var sid=Nexa.lsGet("nexa-sid");
  if(!sid){ sid="c"+Math.random().toString(36).slice(2,10)+Date.now().toString(36); Nexa.lsSet("nexa-sid",sid) }
  var L=Nexa.lsGet("nexa-chat")||{chat:[],shown:[],open:false,unread:false};
  var C=Nexa.lsGet("nexa-cart")||{items:{},nombre:"",last:null};
  function saveL(){ Nexa.lsSet("nexa-chat",L) }
  function saveC(){ Nexa.lsSet("nexa-cart",C) }
  var ICONS={
    cup:'<path d="M10 18h22v10a10 10 0 0 1-10 10h-2a10 10 0 0 1-10-10z" fill="var(--accent)"/><path d="M32 21h3a5 5 0 0 1 0 10h-3.5"/><path d="M16 12c-2-3 2-4 0-7M24 12c-2-3 2-4 0-7"/><path d="M8 43h28"/>',
    jarro:'<path d="M14 13h20l-2 6c5 3 5 14-2 19H18c-7-5-7-16-2-19z" fill="var(--accent)"/><path d="M33 22c6 0 6 9-1 10"/><path d="M12 13h24"/><path d="M19 27l5 4 5-4"/>',
    tea:'<path d="M9 20h26c0 10-5 16-13 16S9 30 9 20z" fill="var(--accent)"/><path d="M35 22c6-1 6 8-2 9"/><path d="M22 20V10l5-3"/><rect x="25" y="4" width="6" height="6" rx="1"/><path d="M12 42h20"/>',
    glass:'<path d="M13 10h22l-3 31H16z" fill="var(--accent)"/><path d="M14.5 20h19"/><path d="M27 10l4-7h5"/>',
    concha:'<circle cx="24" cy="26" r="15" fill="var(--accent)"/><path d="M24 11v30M15 14c5 7 5 17 0 24M33 14c-5 7-5 17 0 24"/>',
    croissant:'<path d="M6 30c2-12 10-20 18-20s16 8 18 20c-4 2-8 0-10-4-2 4-5 6-8 6s-6-2-8-6c-2 4-6 6-10 4z" fill="var(--accent)"/><path d="M16 26c1-6 4-10 8-13M32 26c-1-6-4-10-8-13"/>',
    slice:'<path d="M8 32l28-16 4 16z" fill="var(--accent)"/><path d="M8 32h32v7H8z"/><path d="M23 24l2 8M31 19l3 13"/>',
    plate:'<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="10" fill="var(--accent)"/>',
    taco:'<path d="M5 34a19 19 0 0 1 38 0z" fill="var(--accent)"/><path d="M11 22c2-4 4 0 6-4s4 0 6-4 4 0 6 2 4-1 6 4"/><path d="M5 34h38"/>',
    scissors:'<circle cx="13" cy="35" r="6" fill="var(--accent)"/><circle cx="35" cy="35" r="6" fill="var(--accent)"/><path d="M17 30L34 6M31 30L14 6"/>',
    spark:'<path d="M24 5l4 13 13 4-13 4-4 15-4-15-13-4 13-4z" fill="var(--accent)"/>',
    bag:'<path d="M9 16h30l-3 27H12z" fill="var(--accent)"/><path d="M17 21v-7a7 7 0 0 1 14 0v7"/>'
  };
  function art(p){
    var box=document.createElement("span");
    if(p.img){ var im=document.createElement("img"); im.src=p.img; im.alt=""; im.loading="lazy"; box.appendChild(im) }
    else box.innerHTML='<svg viewBox="0 0 48 48" aria-hidden="true">'+ICONS[Nexa.icon(p)]+'</svg>';
    return box;
  }
  function addBtn(p){
    var n=C.items[p.name]||0, add=el("button","add"+(n?" in":""),n?"× "+n:"+"); add.type="button";
    add.setAttribute("aria-label","Agregar "+p.name+" al pedido"+(n?" (llevas "+n+")":""));
    add.onclick=function(){ C.items[p.name]=(C.items[p.name]||0)+1; saveC(); renderMenu(); renderFavs(); renderCart(); toast(p.name+" agregado a tu pedido.") };
    return add;
  }
  var busy=false, typingEl=null, mine={}, mineSub=null, orders={}, ordSub=null, lastName=null;

  /* ---------- página ---------- */
  function renderSite(){
    var b=Nexa.biz();
    document.documentElement.setAttribute("data-tema",Nexa.theme());
    document.title=b.nombre?b.nombre+(b.giro?" · "+b.giro:""):"Bienvenido";
    $("barName").textContent=b.nombre||""; $("siteName").textContent=b.nombre||"Cargando…";
    $("siteGiro").textContent=b.giro; $("siteGiro").hidden=!b.giro;
    $("siteLema").textContent=b.lema; $("siteLema").hidden=!b.lema;
    $("chatName").textContent=b.nombre||"Asistente"; $("chatAv").textContent=(b.nombre||"N").charAt(0);
    var st=Nexa.openNow(); $("status").hidden=!st;
    if(st){ $("status").className="status"+(st.open?"":" closed"); $("statusText").textContent=st.text }
    var wa=Nexa.waLink("Hola, vi su página y quiero hacer una pregunta.");
    $("heroWa").hidden=!wa; $("heroWa").href=wa||"#";
    var ht=Nexa.hoursTable(), tb=$("hoursTable").tBodies[0]; tb.textContent="";
    $("hoursTable").hidden=!ht; $("hoursText").hidden=!!ht; $("vHorario").textContent=b.horario||"Pregúntanos en el chat";
    (ht||[]).forEach(function(r){ var tr=el("tr",(r.hoy?"hoy":"")+(r.abre?"":" off")); tr.append(el("td",null,r.dia+(r.hoy?" (hoy)":"")),el("td",null,r.texto)); tb.appendChild(tr) });
    var map=Nexa.mapLink(); $("vDir").textContent=b.dir||"Pregúntanos en el chat"; $("mapBtn").hidden=!map; if(map) $("mapBtn").href=map;
    $("vTel").textContent=b.tel||"Escríbenos en el chat"; $("waBtn").hidden=!wa; if(wa) $("waBtn").href=Nexa.waLink("");
    var ex=$("siteExtra"); ex.textContent=""; ex.hidden=!b.extra;
    b.extra.split(/(?<=\.)\s+|\n+/).map(function(t){return t.trim().replace(/\.$/,"")}).filter(Boolean).forEach(function(t){ ex.appendChild(el("li",null,t)) });
    $("nosotros").hidden=!b.historia; $("navAbout").hidden=!b.historia; $("siteHistoria").textContent=b.historia;
    var ig=b.insta.replace(/^@|^https?:\/\/(www\.)?instagram\.com\//,"").replace(/\/$/,""); $("siteInsta").hidden=!ig;
    if(ig){ $("siteInsta").textContent="Síguenos en Instagram: @"+ig; $("siteInsta").href="https://www.instagram.com/"+encodeURIComponent(ig)+"/" }
    $("footGiro").textContent=b.giro;
    $("demoNote").hidden=!Nexa.isDemo();
    $("footName").textContent=b.nombre||"";
    renderFavs(); renderMenu(); renderCart();
  }
  function renderFavs(){
    var cats=Nexa.categories(), picks=[], grid=$("favGrid");
    if(cats.length>=3) picks=cats.slice(0,3).map(function(c){return c.items[0]}); else picks=Nexa.products().slice(0,3);
    picks=picks.filter(function(p){return p && Nexa.money(p.price)>0});
    $("favoritos").hidden=picks.length<3||Nexa.products().length<6; grid.textContent="";
    picks.forEach(function(p){
      var c=el("article","fav"), a=art(p); a.className="art";
      var row=el("div","row"), b=el("button","btn",(C.items[p.name]?"Agregar otro":"Agregar al pedido")); b.type="button";
      b.onclick=function(){ C.items[p.name]=(C.items[p.name]||0)+1; saveC(); renderMenu(); renderFavs(); renderCart(); toast(p.name+" agregado a tu pedido.") };
      row.append(el("span",null,p.price),b);
      c.append(a); if(p.cat) c.appendChild(el("small",null,p.cat)); c.append(el("b",null,p.name)); if(p.desc) c.appendChild(el("p",null,p.desc)); c.appendChild(row);
      grid.appendChild(c);
    });
  }
  function renderMenu(){
    var box=$("siteMenu"), nav=$("cats"), cats=Nexa.categories(); box.textContent=""; nav.textContent="";
    var f=Nexa.norm($("find").value).trim();
    if(!cats.length){ box.appendChild(el("p","empty","El menú aparecerá aquí cuando el negocio lo agregue.")); nav.hidden=true; return }
    nav.hidden=cats.length<2||!!f; var shown=0;
    cats.forEach(function(c,i){
      var items=c.items.filter(function(p){ return !f || Nexa.norm(p.name+" "+p.desc+" "+p.cat).indexOf(f)>=0 }); if(!items.length) return;
      var sec=el("section","cat"); sec.id="cat-"+i;
      if(c.name){ sec.appendChild(el("h3",null,c.name)); var a=el("a",null,c.name); a.href="#cat-"+i; nav.appendChild(a) }
      var grid=el("div","items");
      items.forEach(function(p){
        shown++; var r=el("div","it"), th=art(p); th.className="thumb"; r.append(th,el("span","n",p.name));
        r.appendChild(el("span","d",p.desc||""));
        var buy=el("span","buy"); buy.appendChild(el("span","p",p.price)); if(Nexa.money(p.price)>0) buy.appendChild(addBtn(p)); r.appendChild(buy);
        grid.appendChild(r);
      });
      sec.appendChild(grid); box.appendChild(sec);
    });
    if(!shown) box.appendChild(el("p","empty","No encontramos \""+$("find").value+"\" en el menú. Pregúntale al asistente, quizá lo tengamos."));
  }
  $("find").oninput=renderMenu;
  $("chatBtn").onclick=function(){ L.open=true; saveL(); renderFab(); $("q").focus() };

  /* ---------- pedido ---------- */
  var STEPS=[["nuevo","Recibido por el negocio"],["preparando","En preparación"],["listo","Listo para recoger"],["entregado","Entregado"]];
  function cartLines(){
    var by={}; Nexa.products().forEach(function(p){ by[p.name]=p });
    return Object.keys(C.items).filter(function(n){ return by[n] && C.items[n]>0 }).map(function(n){ return {n:n,c:C.items[n],p:Nexa.money(by[n].price)} });
  }
  function activeOrder(){
    var o=null; Object.keys(orders).forEach(function(id){ var x=orders[id]; if(x&&x.at&&(!o||x.at>o.at)) o=Object.assign({id:id},x) });
    if(!o && C.last) o=C.last;
    if(o && (o.status==="entregado"||o.status==="cancelado") && Date.now()-o.at>3*3600e3) return null;
    return o;
  }
  function orderText(o){
    return "Hola, soy "+o.nombre+". Quiero hacer este pedido para recoger ("+o.hora+"):\n"+o.items.map(function(i){return "• "+i.c+" x "+i.n}).join("\n")+"\nTotal: "+Nexa.pesos(o.total)+(o.nota?"\nNota: "+o.nota:"");
  }
  function renderCart(){
    var lines=cartLines(), count=lines.reduce(function(s,l){return s+l.c},0), total=lines.reduce(function(s,l){return s+l.c*l.p},0);
    $("cartCount").textContent=count; $("cartCount").hidden=!count;
    var o=activeOrder(), tr=$("track");
    tr.hidden=(!o&&!count)||!$("drawer").hidden;
    if(count){ $("trackTitle").textContent="Ver tu pedido"; $("trackSub").textContent=count+(count===1?" producto · ":" productos · ")+Nexa.pesos(total) }
    else if(o){ var st=STEPS.filter(function(x){return x[0]===o.status})[0]; $("trackTitle").textContent="Tu pedido: "+(o.status==="cancelado"?"cancelado":o.status==="local"?"falta confirmarlo":st?st[1].toLowerCase():"enviado"); $("trackSub").textContent=Nexa.pesos(o.total)+" · toca para ver" }
    var body=$("cartBody"); body.textContent="";
    var showOrder=o && !lines.length;
    $("cartTitle").textContent=showOrder?"Tu pedido":"Arma tu pedido";
    $("orderForm").hidden=showOrder||!lines.length; $("orderDone").hidden=!showOrder;
    if(showOrder){ renderOrder(o); return }
    if(!lines.length){ body.appendChild(el("p","empty","Todavía no agregas nada. Toca el + junto a lo que se te antoje del menú.")); return }
    lines.forEach(function(l){
      var r=el("div","line"); r.appendChild(el("span","n",l.n));
      var q=el("span","qty"), m=el("button",null,"−"), n=el("span",null,String(l.c)), p=el("button",null,"+");
      m.type=p.type="button"; m.setAttribute("aria-label","Quitar uno de "+l.n); p.setAttribute("aria-label","Agregar uno de "+l.n);
      m.onclick=function(){ C.items[l.n]--; if(C.items[l.n]<=0) delete C.items[l.n]; saveC(); renderMenu(); renderFavs(); renderCart() };
      p.onclick=function(){ C.items[l.n]++; saveC(); renderMenu(); renderFavs(); renderCart() };
      q.append(m,n,p); r.append(q,el("span","p",Nexa.pesos(l.c*l.p))); body.appendChild(r);
    });
    var t=el("div","total"); t.append(el("span",null,"Total"),el("span",null,Nexa.pesos(total))); body.appendChild(t);
    if(!$("oNombre").value) $("oNombre").value=C.nombre||"";
  }
  function renderOrder(o){
    var body=$("cartBody");
    var tk=el("div","ticket"); o.items.forEach(function(i){ tk.appendChild(el("p",null,i.c+" × "+i.n)) });
    tk.appendChild(el("p",null,"Total: "+Nexa.pesos(o.total)+" · Recoges: "+o.hora)); body.appendChild(tk);
    if(o.status==="local") body.appendChild(el("p","note","No pudimos registrar tu pedido en línea. Envíalo por WhatsApp para que el negocio lo confirme."));
    else if(o.status==="cancelado") body.appendChild(el("p","note","El negocio canceló este pedido. Escríbeles si tienes dudas."));
    else {
      var ul=el("ol","steps"), ix=STEPS.map(function(s){return s[0]}).indexOf(o.status);
      STEPS.forEach(function(s,i){ var li=el("li",i<ix?"done":i===ix?"now":""); li.append(el("i"),el("span",null,s[1])); ul.appendChild(li) });
      body.appendChild(ul); body.appendChild(el("p","note","Esta pantalla se actualiza sola cuando el negocio avanza tu pedido. Pagas al recoger."));
    }
    var wa=Nexa.waLink(orderText(o)); $("orderWa").hidden=!wa; $("orderWa").href=wa||"#";
  }
  function openCart(on){ $("drawer").hidden=!on; $("shade").hidden=!on; renderCart(); if(on) $("closeCart").focus() }
  $("cartBtn").onclick=function(){ openCart(true) }; $("track").onclick=function(){ openCart(true) };
  $("closeCart").onclick=$("shade").onclick=function(){ openCart(false) };
  document.addEventListener("keydown",function(e){ if(e.key==="Escape" && !$("drawer").hidden) openCart(false) });
  $("orderForm").onsubmit=function(e){
    e.preventDefault(); var lines=cartLines(); if(!lines.length) return;
    var nombre=$("oNombre").value.trim(); if(!nombre){ $("oNombre").focus(); return }
    var o={items:lines,total:lines.reduce(function(s,l){return s+l.c*l.p},0),nombre:nombre.slice(0,60),hora:$("oHora").value,nota:$("oNota").value.trim().slice(0,200),at:Date.now(),status:"nuevo"};
    $("sendOrder").disabled=true; C.nombre=o.nombre;
    Nexa.post("/pedidos/"+sid,o).then(function(){ C.last=null; ordSub&&ordSub.refresh(); toast("Pedido enviado. Te avisamos aquí cuando esté listo.") })
      .catch(function(){ o.status="local"; C.last=o })
      .then(function(){ C.items={}; saveC(); $("oNota").value=""; $("sendOrder").disabled=false; if(o.status!=="local") orders["_"+o.at]=o; renderMenu(); renderFavs(); renderCart() });
  };
  $("newOrder").onclick=function(){ C.last=null; saveC(); openCart(false); location.hash="menu" };

  /* ---------- asistente ---------- */
  function toast(m){ nexaToast(m) }
  function scrollLog(){ var l=$("log"); l.scrollTop=l.scrollHeight }
  function push(m){ L.chat.push(m); if(L.chat.length>80) L.chat=L.chat.slice(-80); saveL(); renderChat() }
  function showTyping(on){
    if(on){ typingEl=el("div","typing","Escribiendo…"); $("log").appendChild(typingEl); scrollLog() }
    else if(typingEl){ typingEl.remove(); typingEl=null }
  }
  function record(q,status,ans){ return Nexa.post("/preguntas/"+sid,{q:q,at:Date.now(),status:status,answer:ans||""}).then(function(r){ mineSub&&mineSub.refresh(); return r }) }
  function escalate(q,toTeam){
    return record(q,"pendiente","").then(function(){
      push({k:"n",text: toTeam ? "Claro, ya avisé al equipo. Su respuesta aparecerá aquí." : "No tengo ese dato y prefiero no inventarlo. Ya le pregunté al equipo; su respuesta aparecerá aquí."});
      push({k:"s",text:"Enviado al equipo"});
    }).catch(function(){
      var wa=Nexa.waLink(q), t=Nexa.biz().tel;
      push({k:"n",text:"No tengo ese dato y no pude avisar al equipo en este momento. "+(t?"Puedes escribir al negocio al "+t+".":"Intenta de nuevo en un rato.")});
      if(wa) push({k:"w",text:"Preguntar por WhatsApp",href:wa});
    });
  }
  function ask(q,toTeam){
    q=String(q||"").trim(); if(!q||busy) return;
    busy=true; $("sendBtn").disabled=true; $("q").value="";
    push({k:"u",text:q}); showTyping(true);
    var local = toTeam ? null : Nexa.answer(q);
    var small = local && /^(¡Hola|¡Con gusto)/.test(local);
    var p = (toTeam||small) ? Promise.resolve(undefined) : Nexa.askAI(q);
    var t0=Date.now();
    p.then(function(ai){
      var ans = ai===undefined ? local : ai;   // sin IA configurada o caída: datos y lo aprendido
      return new Promise(function(r){ setTimeout(r,Math.max(0,550-(Date.now()-t0))) }).then(function(){
        showTyping(false);
        if(ans){ push({k:"n",text:ans}); record(q,"nexa",ans).catch(function(){}) }
        else return escalate(q,toTeam);
      });
    }).then(function(){ busy=false; $("sendBtn").disabled=false });
  }
  var OPTS=[
    {l:"Ver menú", q:"¿Qué tienen en el menú?", f:Nexa.menuText},
    {l:"Horario", q:"¿Cuál es su horario?", f:function(){var h=Nexa.biz().horario, s=Nexa.openNow();return h?"Nuestro horario es "+Nexa.lc1(h)+"."+(s?" "+s.text+".":""):""}},
    {l:"Ubicación", q:"¿Dónde están?", f:function(){var d=Nexa.biz().dir;return d?"Estamos en "+d+".":""}},
    {l:"Cómo pedir", q:"¿Cómo hago un pedido?", f:function(){return "Toca el + junto a cada producto del menú, abre \"Tu pedido\" arriba y envíalo. Lo preparamos para que pases a recogerlo y pagas al llegar."}},
    {l:"Hablar con el equipo", q:"Quiero hablar con alguien del equipo", team:true}
  ];
  function pickOpt(o){
    if(busy) return;
    if(o.team){ ask(o.q,true); return }
    var t=o.f(); if(!t){ ask(o.q); return }
    busy=true; push({k:"u",text:o.l}); showTyping(true);
    setTimeout(function(){ showTyping(false); push({k:"n",text:t}); record(o.q,"nexa",t).catch(function(){}); busy=false },450);
  }
  OPTS.forEach(function(o){ var b=el("button","chip",o.l); b.type="button"; b.onclick=function(){pickOpt(o)}; $("opts").appendChild(b) });
  function renderChat(){
    var log=$("log"); log.textContent="";
    var name=Nexa.biz().nombre||"este negocio";
    [{k:"n",text:"¡Hola! Soy el asistente de "+name+". Pregúntame por el menú, precios, horario o cómo pedir."}].concat(L.chat).forEach(function(m){
      if(m.k==="w"){ var a=el("a","chip",m.text); a.href=m.href; a.target="_blank"; a.rel="noopener"; a.style.alignSelf="flex-start"; a.style.textDecoration="none"; log.appendChild(a); return }
      var d=el("div", m.k==="s" ? "sys" : "msg "+m.k);
      if(m.k==="t") d.appendChild(el("span","tag","Respuesta del equipo"));
      d.appendChild(document.createTextNode(m.text)); log.appendChild(d);
    });
    if(typingEl) log.appendChild(typingEl);
    scrollLog();
  }
  function renderFab(){
    $("widget").hidden=!L.open;
    $("fab").setAttribute("aria-expanded",String(!!L.open));
    $("fab").setAttribute("aria-label",L.open?"Cerrar chat":"Abrir chat con el asistente");
    if(L.open) L.unread=false;
    $("fabDot").hidden=!L.unread;
    if(L.open) scrollLog();
  }
  $("fab").onclick=function(){ L.open=!L.open; saveL(); renderFab(); if(L.open) $("q").focus() };
  $("closeChat").onclick=function(){ L.open=false; saveL(); renderFab(); $("fab").focus() };
  $("askForm").onsubmit=function(e){ e.preventDefault(); ask($("q").value) };
  function checkAnswers(){
    var changed=false;
    Object.keys(mine||{}).forEach(function(id){ var p=mine[id];
      if(p && p.status==="respondida" && p.answer && L.shown.indexOf(id)<0){ L.shown.push(id); L.chat.push({k:"t",text:p.answer}); changed=true }
    });
    if(changed){ if(!L.open) L.unread=true; else toast("El equipo respondió tu pregunta."); saveL(); renderChat(); renderFab() }
  }

  /* ---------- arranque ---------- */
  if(window.matchMedia("(max-width:520px)").matches) L.open=false;
  renderSite(); renderChat(); renderFab();
  function changed(){ renderSite(); var n=Nexa.biz().nombre; if(n!==lastName){ lastName=n; renderChat() } }
  Nexa.watchBusiness(changed, function(s){ if(s==="off" && Nexa.useDemo()) changed() });
  setTimeout(function(){ if(Nexa.useDemo()) changed() }, 3500);
  mineSub=Nexa.subscribe("/preguntas/"+sid, function(d){ mine=d||{}; checkAnswers() }, null, false);
  var prev={};
  ordSub=Nexa.subscribe("/pedidos/"+sid, function(d){
    orders=d||{};
    Object.keys(orders).forEach(function(id){ var s=orders[id]&&orders[id].status; if(prev[id] && s && prev[id]!==s && s==="listo") toast("Tu pedido está listo para recoger."); prev[id]=s });
    renderCart();
  }, null, false);
  setInterval(function(){ var st=Nexa.openNow(); if(st){ $("statusText").textContent=st.text; $("status").className="status"+(st.open?"":" closed") } }, 60000);
})();
