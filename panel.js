/* Panel del equipo: resumen, bandeja, pedidos, conocimiento, datos del negocio y compartir. */
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id)};
  function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e }
  var toast=nexaToast;
  var all=[], ords=[], started=false, sub=null, osub=null, seenNew=null, ordDenied=false, drafts={};
  var DAY=86400000;
  function startOfDay(t){ var d=new Date(t||Date.now()); d.setHours(0,0,0,0); return d.getTime() }
  function hora(t){ return new Date(t).toLocaleTimeString("es-MX",{hour:"numeric",minute:"2-digit"}) }

  /* ---------- sesión ---------- */
  var ERR={EMAIL_NOT_FOUND:"Ese correo no está dado de alta en el equipo.",INVALID_PASSWORD:"Contraseña incorrecta.",INVALID_LOGIN_CREDENTIALS:"Correo o contraseña incorrectos. Revisa mayúsculas y minúsculas.",
    INVALID_EMAIL:"Escribe un correo válido.",USER_DISABLED:"Esta cuenta está desactivada.",TOO_MANY_ATTEMPTS_TRY_LATER:"Demasiados intentos. Espera unos minutos.",
    OPERATION_NOT_ALLOWED:"Falta activar el inicio con correo en Firebase.",API_KEY_INVALID:"Falta configurar la clave de Firebase."};
  function showPanel(){ $("loginView").hidden=true; $("teamBody").hidden=false; $("who").textContent=Nexa.email()||""; start() }
  function showLogin(msg){ $("loginView").hidden=false; $("teamBody").hidden=true; if(msg){ $("loginErr").textContent=msg; $("loginErr").hidden=false } }
  $("loginForm").onsubmit=function(e){ e.preventDefault();
    var em=$("email").value.trim(), pw=$("pass").value; if(!em||!pw){ showLogin("Escribe tu correo y contraseña."); return }
    $("loginBtn").disabled=true; $("loginErr").hidden=true;
    Nexa.signIn(em,pw).then(function(){ $("pass").value=""; showPanel() })
      .catch(function(code){ var k=String(code).split(" ")[0]; showLogin(ERR[k]||"No se pudo entrar ("+k+"). Revisa tu conexión.") })
      .then(function(){ $("loginBtn").disabled=false });
  };
  $("logoutBtn").onclick=function(){ Nexa.signOut(); location.reload() };

  /* ---------- navegación ---------- */
  var TABS=[["resumen","Resumen",'<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z"/>'],
    ["bandeja","Bandeja",'<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h5a3 3 0 0 0 6 0h5"/>'],
    ["pedidos","Pedidos",'<path d="M6 7h12l-1 13H7z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>'],
    ["saber","Lo que sabe",'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'],
    ["negocio","Mi negocio",'<path d="M4 10l1.5-5h13L20 10"/><path d="M5 10v10h14V10"/><path d="M4 10a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 10"/><path d="M10 20v-5h4v5"/>'],
    ["compartir","Compartir",'<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.900l7.6-3.800M8.2 13.100l7.6 3.8"/>']];
  TABS.forEach(function(t){
    var b=el("button"); b.type="button"; b.id="t-"+t[0]; b.setAttribute("role","tab"); b.setAttribute("aria-controls","v-"+t[0]);
    b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+t[2]+'</svg>'; b.appendChild(el("span",null,t[1]));
    if(t[0]==="bandeja"||t[0]==="pedidos"){ var bd=el("span","badge"); bd.id=t[0]==="bandeja"?"pendBadge":"ordBadge"; bd.hidden=true; b.appendChild(bd) }
    b.onclick=function(){ showTab(t[0]) }; $("nav").appendChild(b);
  });
  function showTab(n){ TABS.forEach(function(t){ $("t-"+t[0]).setAttribute("aria-selected",String(t[0]===n)); $("v-"+t[0]).hidden=t[0]!==n }); Nexa.lsSet("nexa-tab",n); window.scrollTo(0,0) }
  showTab((function(){ var n=Nexa.lsGet("nexa-tab"); return TABS.some(function(t){return t[0]===n})?n:"resumen" })());

  /* ---------- conexión ---------- */
  function status(s){
    if(s==="signedout"){ showLogin("Tu sesión terminó. Vuelve a entrar."); return }
    var txt={on:"Conectado en vivo",off:"Sin conexión",denied:"Sin permiso en Firebase"}[s]||s;
    $("liveTag").className="live"+(s==="on"?"":" off"); $("liveTag").lastChild.textContent=txt;
  }
  function flat(d,key){ var out=[]; d=d||{};
    Object.keys(d).forEach(function(sid){ var c=d[sid]; if(!c||typeof c!=="object") return; Object.keys(c).forEach(function(id){ var p=c[id]; if(p&&typeof p==="object"&&p[key]) out.push(Object.assign({id:id,sid:sid},p)) }) });
    return out }
  function ding(){ try{ var C=window.AudioContext||window.webkitAudioContext, a=new C(), o=a.createOscillator(), g=a.createGain(); o.frequency.value=880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.12,a.currentTime); g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.5); o.start(); o.stop(a.currentTime+.5) }catch(e){} }
  function start(){
    if(started) return; started=true;
    Nexa.watchBusiness(render, null);
    sub=Nexa.subscribe("/preguntas", function(d){ all=flat(d,"q").sort(function(a,b){return (a.at||0)-(b.at||0)}); render() }, status, true);
    osub=Nexa.subscribe("/pedidos", function(d){
      ords=flat(d,"items").sort(function(a,b){return (a.at||0)-(b.at||0)});
      var n=ords.filter(function(o){return o.status==="nuevo"}).length;
      if(seenNew!==null && n>seenNew){ toast("Llegó un pedido nuevo."); ding() }
      seenNew=n; ordDenied=false; render();
    }, function(s){ if(s==="denied"){ ordDenied=true; render() } }, true);
  }

  /* ---------- pintar ---------- */
  function render(){
    var b=Nexa.biz();
    $("teamBiz").textContent=b.nombre||"Sin datos del negocio"; $("teamGiro").textContent=b.giro;
    $("setupBox").hidden=!!b.nombre;
    var pend=all.filter(function(p){return p.status==="pendiente"}), nuevos=ords.filter(function(o){return o.status==="nuevo"}).length;
    $("pendBadge").hidden=!pend.length; $("pendBadge").textContent=pend.length;
    $("ordBadge").hidden=!nuevos; $("ordBadge").textContent=nuevos;
    document.title=(pend.length+nuevos?"("+(pend.length+nuevos)+") ":"")+"NEXA · "+(b.nombre||"Panel del equipo");
    renderResumen(pend.length,nuevos); renderTickets(pend); renderFeed(); renderOrders(); renderFaqs(); fillForm();
  }
  function renderResumen(pend,nuevos){
    var t0=startOfDay(), h=new Date().getHours();
    $("hello").textContent=(h<12?"Buenos días":h<19?"Buenas tardes":"Buenas noches")+(Nexa.biz().nombre?", "+Nexa.biz().nombre:"");
    $("today").textContent=new Date().toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"}).replace(/^./,function(c){return c.toUpperCase()});
    var hoy=all.filter(function(p){return p.at>=t0}), nexa=all.filter(function(p){return p.status==="nexa"}).length;
    $("kQ").textContent=hoy.length; $("kQs").textContent=pend?pend+(pend===1?" espera tu respuesta":" esperan tu respuesta"):"Nada pendiente";
    $("kAuto").textContent=all.length?Math.round(nexa/all.length*100)+"%":"–";
    var oh=ords.filter(function(o){return o.at>=t0&&o.status!=="cancelado"});
    $("kO").textContent=oh.length; $("kOs").textContent=nuevos?nuevos+(nuevos===1?" nuevo por atender":" nuevos por atender"):"Ninguno por atender";
    $("kV").textContent=Nexa.pesos(oh.reduce(function(s,o){return s+(Number(o.total)||0)},0)); $("kMin").textContent="NEXA te ahorró aprox. "+nexa*2+" min en total";
    var ch=$("chart"); ch.textContent=""; var days=[], max=1;
    for(var i=6;i>=0;i--){ var a=t0-i*DAY, d=all.filter(function(p){return p.at>=a&&p.at<a+DAY}); var n=d.filter(function(p){return p.status==="nexa"}).length; days.push({t:a,n:n,e:d.length-n}); max=Math.max(max,d.length) }
    days.forEach(function(d){ var c=el("div","col"); c.appendChild(el("em",null,d.n+d.e?String(d.n+d.e):""));
      var e=el("div","bar e"), n=el("div","bar n"); e.style.height=(d.e/max*82)+"%"; n.style.height=(d.n/max*82)+"%"; c.append(e,n);
      c.appendChild(el("span",null,new Date(d.t).toLocaleDateString("es-MX",{weekday:"short"}).replace(".",""))); ch.appendChild(c) });
    var groups={}; all.forEach(function(p){ if(/hablar con alguien/i.test(p.q)) return; var k=Nexa.words(p.q).sort().join(" "); if(!k) return; (groups[k]=groups[k]||{q:p.q,c:0,auto:false}).c++; if(p.status==="nexa") groups[k].auto=true });
    var top=$("top"); top.textContent=""; var list=Object.keys(groups).map(function(k){return groups[k]}).sort(function(a,b){return b.c-a.c}).slice(0,5);
    if(!list.length) top.appendChild(el("li",null,"Aquí verás las preguntas más repetidas de tus clientes."));
    list.forEach(function(g){ var li=el("li"); li.append(el("b",null,g.c+"×"),el("span",null,g.q),el("span","pill "+(g.auto?"nexa":"pend"),g.auto?"NEXA la responde":"Sin guardar")); top.appendChild(li) });
  }
  function write(p){ return p.then(function(r){ sub&&sub.refresh(); return r }) }
  function renderTickets(pend){
    var box=$("tickets"), active=document.activeElement&&document.activeElement.id; box.textContent="";
    if(!pend.length){ box.appendChild(el("div","empty","Bandeja al día. Cuando un cliente pregunte algo que NEXA no sabe, aparecerá aquí en vivo.")); return }
    pend.forEach(function(p){
      var key=p.sid+"/"+p.id, t=el("form","ticket");
      var inp=el("input"); inp.type="text"; inp.id="r-"+p.id; inp.maxLength=300; inp.placeholder="Escribe la respuesta para el cliente"; inp.setAttribute("aria-label","Tu respuesta");
      inp.value=drafts[key]||""; inp.oninput=function(){drafts[key]=inp.value};
      var ck=el("label","check"), cb=el("input"); cb.type="checkbox"; cb.checked=!/hablar con alguien/i.test(p.q); ck.append(cb,document.createTextNode("Que NEXA la aprenda para la próxima vez"));
      var row=el("div","row"), send=el("button","btn","Responder"), del=el("button","btn ghost","Descartar"); send.type="submit"; del.type="button"; row.append(send,del);
      t.append(el("small",null,"Cliente · "+Nexa.ago(p.at)),el("div","q",p.q),inp,ck,row);
      t.onsubmit=function(ev){ ev.preventDefault(); var a=inp.value.trim(); if(!a){inp.focus();return} send.disabled=true;
        write(Nexa.patch("/preguntas/"+key,{status:"respondida",answer:a,answeredAt:Date.now()},true)).then(function(){ delete drafts[key];
          if(cb.checked) return Nexa.post("/faqs",{q:p.q,a:a,src:"equipo",at:Date.now()},true);
        }).then(function(){ toast(cb.checked?"Respondido. NEXA ya lo aprendió.":"Respondido.") }).catch(function(){ send.disabled=false; toast("No se pudo enviar. Revisa tu conexión.") }) };
      del.onclick=function(){ write(Nexa.patch("/preguntas/"+key,{status:"descartada"},true)).catch(function(){toast("No se pudo descartar.")}) };
      box.appendChild(t);
    });
    if(active && $(active)) $(active).focus();
  }
  function renderFeed(){
    var box=$("feed"); box.textContent=""; var list=all.slice().reverse().slice(0,30);
    if(!list.length){ box.appendChild(el("p","sub","Todavía no hay conversaciones. Abre tu página y haz una pregunta de prueba.")); return }
    var map={nexa:["nexa","NEXA"],pendiente:["pend","Pendiente"],respondida:["team","Equipo"],descartada:["pend","Descartada"]};
    list.forEach(function(p){ var r=el("div","fi"), m=map[p.status]||map.pendiente; r.append(el("span","pill "+m[0],m[1]),el("span",null,p.q),el("time",null,Nexa.ago(p.at)));
      if(p.answer) r.appendChild(el("span","a",p.answer)); box.appendChild(r) });
  }

  /* ---------- pedidos ---------- */
  var NEXT={nuevo:["preparando","Empezar a preparar"],preparando:["listo","Avisar que está listo"],listo:["entregado","Entregado"]};
  function setOrder(o,st,btn){ if(btn) btn.disabled=true;
    Nexa.patch("/pedidos/"+o.sid+"/"+o.id,{status:st,updatedAt:Date.now()},true).then(function(){ osub&&osub.refresh() }).catch(function(){ if(btn) btn.disabled=false; toast("No se pudo actualizar. Revisa tu conexión.") }) }
  function renderOrders(){
    $("ordWarn").hidden=!ordDenied;
    var count={nuevo:0,preparando:0,listo:0};
    ["nuevo","preparando","listo"].forEach(function(st){
      var lane=$("l-"+st), list=ords.filter(function(o){return o.status===st}); lane.textContent=""; count[st]=list.length;
      if(!list.length) lane.appendChild(el("p","none",st==="nuevo"?"Los pedidos nuevos caen aquí.":"Nada por ahora."));
      list.forEach(function(o){
        var c=el("article","order"+(st==="nuevo"?" new":"")), who=el("div","who"); who.append(el("span",null,o.nombre||"Cliente"),el("time",null,hora(o.at)+" · "+Nexa.ago(o.at)));
        var ul=el("ul"); (o.items||[]).forEach(function(i){ ul.appendChild(el("li",null,i.c+" × "+i.n)) });
        c.append(who,el("small","sub","Recoge: "+(o.hora||"lo antes posible")),ul);
        if(o.nota) c.appendChild(el("div","nota","Nota: "+o.nota));
        var tot=el("div","tot"); tot.append(el("span",null,"Paga al recoger"),el("b",null,Nexa.pesos(Number(o.total)||0))); c.appendChild(tot);
        var row=el("div","row"), go=el("button","btn sm",NEXT[st][1]), no=el("button","link","Cancelar"); go.type=no.type="button"; row.style.justifyContent="space-between";
        go.onclick=function(){ setOrder(o,NEXT[st][0],go) }; no.onclick=function(){ if(no.dataset.sure){ setOrder(o,"cancelado") } else { no.dataset.sure=1; no.textContent="¿Seguro? Toca otra vez" } };
        row.append(go,no); c.appendChild(row); lane.appendChild(c);
      });
    });
    $("cNuevo").textContent=count.nuevo||""; $("cPrep").textContent=count.preparando||""; $("cListo").textContent=count.listo||"";
    var done=$("done"), t0=startOfDay(); done.textContent="";
    var closed=ords.filter(function(o){return (o.status==="entregado"||o.status==="cancelado")&&o.at>=t0}).reverse();
    if(!closed.length) done.appendChild(el("p","sub","Los pedidos entregados o cancelados de hoy aparecen aquí."));
    closed.forEach(function(o){ var r=el("div","fi"); r.append(el("span","pill "+(o.status==="entregado"?"ok":"pend"),o.status==="entregado"?"Entregado":"Cancelado"),
      el("span",null,(o.nombre||"Cliente")+" · "+(o.items||[]).map(function(i){return i.c+" × "+i.n}).join(", ")),el("time",null,Nexa.pesos(Number(o.total)||0))); done.appendChild(r) });
  }

  /* ---------- conocimiento ---------- */
  function renderFaqs(){
    var box=$("faqList"), fs=Nexa.faqs(); box.textContent=""; $("faqCount").textContent="Respuestas guardadas ("+fs.length+")";
    if(!fs.length){ box.appendChild(el("p","sub","Aún no hay respuestas guardadas.")); return }
    fs.slice().reverse().forEach(function(f){ var r=el("div","faq");
      var x=el("button","x","×"); x.type="button"; x.setAttribute("aria-label","Borrar: "+f.q);
      x.onclick=function(){ Nexa.del("/faqs/"+f.id,true).catch(function(){toast("No se pudo borrar.")}) };
      r.append(el("b",null,f.q),x,el("span","a",f.a)); var s=el("span"); s.appendChild(el("span","pill "+(f.src==="equipo"?"team":"nexa"),f.src==="equipo"?"Aprendida de tu respuesta":"Agregada por ti")); r.appendChild(s);
      box.appendChild(r) });
  }
  $("faqForm").onsubmit=function(e){ e.preventDefault(); var q=$("nQ").value.trim(), a=$("nA").value.trim(); if(!q||!a){ toast("Escribe la pregunta y la respuesta."); return }
    Nexa.post("/faqs",{q:q,a:a,src:"negocio",at:Date.now()},true).then(function(){ $("nQ").value=""; $("nA").value=""; toast("Respuesta guardada.") }).catch(function(){toast("No se pudo guardar.")}) };

  /* ---------- mi negocio ---------- */
  Object.keys(Nexa.THEMES).forEach(function(k){ var o=el("option",null,Nexa.THEMES[k]); o.value=k; $("fEstilo").appendChild(o) });
  var F={fNombre:"nombre",fGiro:"giro",fLema:"lema",fEstilo:"estilo",fHorario:"horario",fTel:"tel",fDir:"dir",fProd:"prod",fExtra:"extra",fHistoria:"historia",fInsta:"insta"};
  var dirty=false;
  Object.keys(F).forEach(function(id){ $(id).addEventListener("input",function(){dirty=true}) });
  function fillForm(){ if(dirty) return; var b=Nexa.biz(); Object.keys(F).forEach(function(id){ if(document.activeElement!==$(id)) $(id).value=b[F[id]]||"" }) }
  $("bizForm").onsubmit=function(ev){ ev.preventDefault(); var nb={}; Object.keys(F).forEach(function(id){ nb[F[id]]=$(id).value.trim() });
    Nexa.put("/config",nb,true).then(function(){ dirty=false; toast("Guardado. Tus clientes ya ven los cambios.") }).catch(function(){ toast("No se pudo guardar. Revisa tu conexión.") }) };
  $("seedBtn").onclick=$("seedBtn2").onclick=function(){ dirty=false;
    Nexa.put("/config",Nexa.DEMO,true)
    .then(function(){ if(Nexa.faqs().length) return; return Nexa.post("/faqs",{q:"¿Tienen servicio a domicilio?",a:"Por ahora no tenemos servicio a domicilio, pero puedes pedir en línea y recoger en el local.",src:"negocio",at:Date.now()},true) })
    .then(function(){ toast("Ejemplo cargado.") }).catch(function(){ toast("No se pudo cargar. Revisa la conexión.") }) };

  /* ---------- compartir ---------- */
  var url=location.href.replace(/[#?].*$/,"").replace(/equipo\.html$/,"");
  $("clientUrl").textContent=url;
  $("copyBtn").onclick=function(){ try{ navigator.clipboard.writeText(url).then(function(){toast("Enlace copiado.")},selectUrl) }catch(e){ selectUrl() } };
  function selectUrl(){ var r=document.createRange(); r.selectNodeContents($("clientUrl")); var s=getSelection(); s.removeAllRanges(); s.addRange(r); toast("Copia el enlace seleccionado.") }
  if(typeof qrcode==="function"){ try{
    var qr=qrcode(0,"M"); qr.addData(url); qr.make(); var svg=qr.createSvgTag({cellSize:6,margin:2,scalable:true});
    $("qrBox").innerHTML=svg; $("qrCard").hidden=false;
    $("qrDl").onclick=function(){ var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"})); a.download="qr-mi-pagina.svg"; a.click() };
  }catch(e){} }

  if(Nexa.authed()) showPanel(); else showLogin();
})();
