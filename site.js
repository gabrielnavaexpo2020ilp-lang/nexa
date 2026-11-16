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
    $("vHorario").textContent=b.horario||"Pregúntanos en el chat"; $("vStatus").textContent=st?st.text:"";
    var map=Nexa.mapLink(), d=$("vDir"); d.textContent="";
    if(map){ var a=el("a",null,b.dir); a.href=map; a.target="_blank"; a.rel="noopener"; d.appendChild(a) } else d.textContent=b.dir||"Pregúntanos en el chat";
    var t=$("vTel"); t.textContent="";
    if(wa){ var w=el("a",null,b.tel); w.href=Nexa.waLink(""); w.target="_blank"; w.rel="noopener"; t.appendChild(w) } else t.textContent=b.tel||"Escríbenos en el chat";
    $("siteExtra").textContent=b.extra; $("siteExtra").hidden=!b.extra;
    $("demoNote").hidden=!Nexa.isDemo();
    $("footName").textContent=b.nombre||"";
    renderMenu(); renderCart();
  }
  function renderMenu(){
    var box=$("siteMenu"), nav=$("cats"), cats=Nexa.categories(); box.textContent=""; nav.textContent="";
    if(!cats.length){ box.appendChild(el("p","empty","El menú aparecerá aquí cuando el negocio lo agregue.")); nav.hidden=true; return }
    nav.hidden=cats.length<2;
    cats.forEach(function(c,i){
      var sec=el("section","cat"); sec.id="cat-"+i;
      if(c.name){ sec.appendChild(el("h3",null,c.name)); var a=el("a",null,c.name); a.href="#cat-"+i; nav.appendChild(a) }
      var grid=el("div","items");
      c.items.forEach(function(p){
        var r=el("div","it"); r.appendChild(el("span","n",p.name));
        if(p.desc) r.appendChild(el("span","d",p.desc));
        r.appendChild(el("span","p",p.price));
        if(Nexa.money(p.price)>0){
          var n=C.items[p.name]||0, add=el("button","add"+(n?" in":""),n?String(n):"+"); add.type="button";
          add.setAttribute("aria-label","Agregar "+p.name+" al pedido"+(n?" (llevas "+n+")":""));
          add.onclick=function(){ C.items[p.name]=(C.items[p.name]||0)+1; saveC(); renderMenu(); renderCart(); toast(p.name+" agregado a tu pedido.") };
          r.appendChild(add);
        }
        grid.appendChild(r);
      });
      sec.appendChild(grid); box.appendChild(sec);
    });
  }

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
    tr.hidden=!o||!$("drawer").hidden;
    if(o){ var s=STEPS.filter(function(x){return x[0]===o.status})[0]; $("trackTitle").textContent="Tu pedido: "+(o.status==="cancelado"?"cancelado":o.status==="local"?"sin confirmar":s?s[1].toLowerCase():"enviado"); $("trackSub").textContent=Nexa.pesos(o.total)+" · toca para ver" }
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
      m.onclick=function(){ C.items[l.n]--; if(C.items[l.n]<=0) delete C.items[l.n]; saveC(); renderMenu(); renderCart() };
      p.onclick=function(){ C.items[l.n]++; saveC(); renderMenu(); renderCart() };
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
      .then(function(){ C.items={}; saveC(); $("oNota").value=""; $("sendOrder").disabled=false; if(o.status!=="local") orders["_"+o.at]=o; renderMenu(); renderCart() });
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
