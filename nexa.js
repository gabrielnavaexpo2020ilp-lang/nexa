/* NEXA — núcleo compartido por la página del cliente (index.html) y el panel del equipo (equipo.html).
   Base de datos: Firebase Realtime Database por REST (sin SDK).
   Acceso del equipo: Firebase Authentication con correo y contraseña. */
var NEXA_DB = "https://nexa-c5176-default-rtdb.firebaseio.com";
var NEXA_API_KEY = "AIzaSyBY_HJBa2I5LD_gXyXjtgCNMS13lFiZ6Gg";
var NEXA_AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
var NEXA_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
/* Respuestas con IA: pega aquí la dirección de tu Worker (ver LEEME.md). Vacío = NEXA responde solo con los datos y lo aprendido. */
var NEXA_AI_URL = "";

var Nexa = (function(){
  "use strict";
  var base = String(NEXA_DB).replace(/\/+$/,"");
  var ready = /^https?:\/\/.+/.test(base);

  /* ---------- sesión del equipo ---------- */
  var S = lsGet("nexa-auth"); // {idToken, refreshToken, exp, email}
  function authed(){ return !!(S && S.refreshToken) }
  function token(){
    if(!authed()) return Promise.resolve(null);
    if(S.idToken && Date.now() < S.exp - 60000) return Promise.resolve(S.idToken);
    return fetch(NEXA_TOKEN_URL + "?key=" + encodeURIComponent(NEXA_API_KEY), {
      method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:"grant_type=refresh_token&refresh_token=" + encodeURIComponent(S.refreshToken)
    }).then(function(r){ return r.json().then(function(d){ if(!r.ok) throw d; return d }) })
      .then(function(d){ S.idToken=d.id_token; S.refreshToken=d.refresh_token; S.exp=Date.now()+Number(d.expires_in)*1000; lsSet("nexa-auth",S); return S.idToken })
      .catch(function(){ signOut(); return null });
  }
  function signIn(email, pass){
    return fetch(NEXA_AUTH_URL + "?key=" + encodeURIComponent(NEXA_API_KEY), {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email:email, password:pass, returnSecureToken:true})
    }).then(function(r){ return r.json().then(function(d){ if(!r.ok) throw (d && d.error && d.error.message) || "ERROR"; return d }) })
      .then(function(d){ S={idToken:d.idToken, refreshToken:d.refreshToken, exp:Date.now()+Number(d.expiresIn)*1000, email:d.email}; lsSet("nexa-auth",S); return S.email });
  }
  function signOut(){ S=null; try{ localStorage.removeItem("nexa-auth") }catch(e){} }
  function url(path, tok){ return base + path + ".json" + (tok ? "?auth=" + encodeURIComponent(tok) : "") }

  /* ---------- lecturas en vivo: streaming y, si falla, revisión cada 3 s ---------- */
  function subscribe(path, cb, onStatus, useAuth){
    var data = null, es = null, pollT = null, got = false, stopped = false;
    function status(s){ onStatus && onStatus(s) }
    function setAt(rel, val, merge){
      var parts = rel.split("/").filter(Boolean);
      if(!parts.length){
        if(merge && val){ data = (data && typeof data==="object") ? data : {}; Object.keys(val).forEach(function(k){ setAt("/"+k, val[k], false) }) }
        else data = val;
        return;
      }
      if(!data || typeof data!=="object") data = {};
      var node = data;
      for(var i=0;i<parts.length-1;i++){ if(!node[parts[i]] || typeof node[parts[i]]!=="object") node[parts[i]]={}; node=node[parts[i]] }
      var last = parts[parts.length-1];
      if(merge && val && typeof val==="object"){ Object.keys(val).forEach(function(k){ setAt(rel.replace(/\/$/,"")+"/"+k, val[k], false) }) }
      else if(val===null) delete node[last];
      else node[last] = val;
    }
    function poll(){
      return token().then(function(t){
        if(useAuth && !t){ status("signedout"); return }
        return fetch(url(path, useAuth ? t : null), {cache:"no-store"}).then(function(r){
          if(r.status===401||r.status===403){ status("denied"); return }
          if(!r.ok) throw 0;
          return r.json().then(function(d){ data=d; status("on"); cb(data) });
        });
      }).catch(function(){ status("off") });
    }
    function startPoll(){ if(pollT||stopped) return; poll(); pollT=setInterval(poll, 3000) }
    function open(){
      if(stopped) return;
      token().then(function(t){
        if(useAuth && !t){ status("signedout"); return }
        if(typeof EventSource==="undefined"){ startPoll(); return }
        try{ es && es.close() }catch(e){}
        try{ es = new EventSource(url(path, useAuth ? t : null)) }catch(e){ startPoll(); return }
        es.addEventListener("put", function(e){ var m=JSON.parse(e.data); got=true; setAt(m.path, m.data, false); status("on"); cb(data) });
        es.addEventListener("patch", function(e){ var m=JSON.parse(e.data); got=true; setAt(m.path, m.data, true); cb(data) });
        es.addEventListener("cancel", function(){ try{es.close()}catch(e){} status("denied"); startPoll() });
        es.addEventListener("auth_revoked", function(){ try{es.close()}catch(e){} if(S) S.exp=0; open() });
        es.onerror = function(){ if(!got || es.readyState===2) startPoll() };
        setTimeout(function(){ if(!got) startPoll() }, 6000);
      });
    }
    poll(); open();
    if(useAuth) setInterval(function(){ if(!pollT){ if(S) S.exp=0; open() } }, 50*60*1000);
    return { refresh: poll, stop: function(){ stopped=true; try{es&&es.close()}catch(e){} clearInterval(pollT) } };
  }

  function req(method, path, body, useAuth){
    if(!ready) return Promise.reject(new Error("setup"));
    return token().then(function(t){
      return fetch(url(path, useAuth ? t : null), {method:method, headers:{"Content-Type":"application/json"}, body: body===undefined?undefined:JSON.stringify(body)});
    }).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json() });
  }

  /* ---------- datos ---------- */
  var config = {}, faqsObj = {};
  function biz(){ var b=config||{}; return {nombre:b.nombre||"",giro:b.giro||"",lema:b.lema||"",estilo:b.estilo||"",horario:b.horario||"",tel:b.tel||"",dir:b.dir||"",prod:b.prod||"",extra:b.extra||""} }
  function faqs(){ var o=faqsObj||{}; return Object.keys(o).map(function(id){ return Object.assign({id:id}, o[id]) }).sort(function(a,b){return (a.at||0)-(b.at||0)}) }

  /* ---------- texto ---------- */
  var STOP="que tienen tiene hay para los las una uno unos unas con por del como cual donde esta estan son sus ustedes puedo pueden tengo mas algun alguna venden manejan aceptan quiero saber hola buenas buenos dias tardes noches favor me nos le les el la lo al de en y o a es su mi tu se si no".split(" ");
  function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9ñ ]/g," ")}
  function stem(w){return w.length>4 ? w.replace(/(es|s)$/,"") : w}
  function words(s){return norm(s).split(/\s+/).filter(function(w){return w.length>2 && STOP.indexOf(w)<0}).map(stem)}
  function overlap(a,b){ if(!a.length||!b.length) return 0; var c=0; a.forEach(function(w){ if(b.indexOf(w)>=0) c++ }); return c/Math.min(a.length,b.length) }
  function has(ws,list){ return list.some(function(x){return ws.indexOf(stem(norm(x)))>=0}) }
  function lc1(s){ return String(s).replace(/^(\w)/,function(c){return c.toLowerCase()}) }
  /* Una línea por producto: "Nombre - $precio - descripción". Una línea que empieza con # abre una categoría. */
  function products(){
    var cat="";
    return biz().prod.split("\n").map(function(l){
      l=l.trim(); if(!l) return null;
      if(l.charAt(0)==="#"){ cat=l.replace(/^#+\s*/,""); return null }
      var m=l.split(/\s+[-–]\s+|:\s+/); var name=(m[0]||"").trim(); var price=(m[1]||"").trim(); var desc=m.slice(2).join(" - ").trim();
      return name?{name:name,price:price,desc:desc,cat:cat,w:words(name)}:null }).filter(Boolean);
  }
  function categories(){ var out=[], by={}; products().forEach(function(p){ var c=p.cat||""; if(!by[c]){ by[c]={name:c,items:[]}; out.push(by[c]) } by[c].items.push(p) }); return out }
  function money(t){ var m=String(t||"").replace(/,/g,"").match(/\d+(\.\d+)?/); return m?Number(m[0]):0 }
  function pesos(n){ return "$"+(Math.round(n*100)/100).toLocaleString("es-MX") }

  /* ---------- horario: entiende textos como "Lunes a sábado de 8:00 a 20:00" ---------- */
  var DAYS=["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  function hours(){
    var t=norm(biz().horario).replace(/\s+/g," "); if(!t.trim()) return null;
    var tm=biz().horario.toLowerCase().match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:hrs?\.?|h)?\s*(?:a|-|–|hasta)\s*(?:las\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
    if(!tm) return null;
    function mins(h,m,ap){ h=Number(h); m=Number(m||0); if(ap){ ap=ap.charAt(0); if(ap==="p"&&h<12) h+=12; if(ap==="a"&&h===12) h=0 } return h*60+m }
    var o=mins(tm[1],tm[2],tm[3]), c=mins(tm[4],tm[5],tm[6]); if(c<=o && !tm[6] && c<=12*60) c+=12*60;
    var days=[false,false,false,false,false,false,false], rng=t.match(new RegExp("("+DAYS.join("|")+") (?:a|al) ("+DAYS.join("|")+")"));
    if(rng){ var a=DAYS.indexOf(rng[1]), b=DAYS.indexOf(rng[2]), k=a; for(var n=0;n<7;n++){ days[k]=true; if(k===b) break; k=(k+1)%7 } }
    else { var any=false; DAYS.forEach(function(d,ix){ if(t.indexOf(d)>=0){ days[ix]=true; any=true } }); if(!any) days=days.map(function(){return true}) }
    return {days:days,open:o,close:c};
  }
  function hhmm(m){ var h=Math.floor(m/60)%24, mm=m%60; return h+":"+(mm<10?"0":"")+mm }
  function openNow(){
    var h=hours(); if(!h) return null;
    var d=new Date(), now=d.getHours()*60+d.getMinutes(), day=d.getDay();
    if(h.days[day] && now>=h.open && now<h.close) return {open:true,text:"Abierto ahora, cerramos a las "+hhmm(h.close)};
    if(h.days[day] && now<h.open) return {open:false,text:"Cerrado, abrimos hoy a las "+hhmm(h.open)};
    for(var i=1;i<=7;i++){ var k=(day+i)%7; if(h.days[k]) return {open:false,text:"Cerrado, abrimos "+(i===1?"mañana":"el "+["domingo","lunes","martes","miércoles","jueves","viernes","sábado"][k])+" a las "+hhmm(h.open)} }
    return null;
  }
  function waNumber(){ var d=biz().tel.replace(/\D/g,""); if(d.length===10) d="52"+d; return d.length>=11?d:"" }
  function waLink(text){ var n=waNumber(); return n?"https://wa.me/"+n+(text?"?text="+encodeURIComponent(text):""):"" }
  function mapLink(){ var b=biz(); return b.dir && b.dir.charAt(0)!=="[" ? "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(b.nombre+" "+b.dir) : "" }
  var THEMES={cafeteria:"Cafetería o panadería",taqueria:"Taquería o restaurante",estetica:"Estética, barbería o spa",tienda:"Tienda o papelería"};
  function theme(){
    var b=biz(); if(THEMES[b.estilo]) return b.estilo; var g=norm(b.giro);
    if(/taco|taquer|restaur|comida|cocina|antojit|pizz|hamburg|fonda|maris/.test(g)) return "taqueria";
    if(/estetic|barber|salon|spa|unas|belleza|peluquer/.test(g)) return "estetica";
    if(/tienda|papeler|abarrot|boutique|ropa|ferreter|regalo|accesori/.test(g)) return "tienda";
    return "cafeteria";
  }
  /* IA: el Worker lee los datos del negocio y responde; si no sabe, devuelve sabe:false y la pregunta pasa al equipo. */
  function askAI(q){
    if(!NEXA_AI_URL) return Promise.resolve(undefined);
    var ctl=typeof AbortController!=="undefined"?new AbortController():null, t=setTimeout(function(){ ctl&&ctl.abort() },12000);
    return fetch(NEXA_AI_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pregunta:String(q).slice(0,300)}),signal:ctl?ctl.signal:undefined})
      .then(function(r){ if(!r.ok) throw 0; return r.json() })
      .then(function(d){ clearTimeout(t); return d && d.sabe && d.respuesta ? String(d.respuesta) : null })
      .catch(function(){ clearTimeout(t); return undefined });
  }
  var DEMO={nombre:"Café Central",giro:"Cafetería de barrio",lema:"Café de olla, pan del día y una mesa para quedarse un rato.",estilo:"cafeteria",
    horario:"Lunes a sábado de 8:00 a 20:00",tel:"55 1234 5678 (WhatsApp)",dir:"[Dirección de ejemplo]",
    prod:"# Café\nCafé de olla - $38 - Con canela y piloncillo, en pocillo de peltre\nAmericano - $40 - Grano de Veracruz, tueste medio\nLatte - $60 - Espresso doble con leche vaporizada\nCapuchino - $55 - Con canela o cocoa encima\n# Sin café\nChocolate caliente - $50 - De metate, batido con molinillo\nTé chai - $52 - Especiado, con leche\nAgua fresca del día - $30 - Pregunta por el sabor de hoy\n# Pan y antojos\nConcha - $22 - Vainilla o chocolate, horneada en la mañana\nCroissant - $35 - De mantequilla\nPan de elote - $30 - Rebanada, receta de la casa\nMolletes - $68 - Con frijoles, queso gratinado y pico de gallo",
    extra:"Aceptamos efectivo y tarjeta. Tenemos wifi gratis para clientes. Puedes pedir para llevar."};
  var demo=false;
  function useDemo(){ if(biz().nombre) return false; config=DEMO; faqsObj={d1:{q:"¿Tienen servicio a domicilio?",a:"Por ahora no tenemos servicio a domicilio, pero puedes pedir en línea y recoger en el local.",src:"negocio",at:1}}; demo=true; return true }
  function menuText(){ var ps=products(); return ps.length?"Este es nuestro menú:\n"+ps.map(function(p){return "• "+p.name+(p.price?" ("+p.price+")":"")}).join("\n"):"" }
  function answer(q){
    var b=biz(), raw=norm(q), w=words(q);
    if(/^\s*(hola|buen[oa]s?|que tal|hey)\b/.test(raw) && w.length<=1) return "¡Hola! Soy el asistente de "+(b.nombre||"este negocio")+". ¿En qué te ayudo?";
    if(/\bgracias\b/.test(raw) && w.length<=2) return "¡Con gusto! Aquí estoy si necesitas algo más.";
    var best=null, bs=0;
    faqs().forEach(function(f){ var s=overlap(w,words(f.q)); if(s>bs){bs=s;best=f} });
    if(best && bs>=0.6) return best.a;
    if(has(w,["hora","horario","cierran","abren","cierra","abre","abierto","horas"]) && b.horario) return "Nuestro horario es "+lc1(b.horario)+".";
    if(has(w,["direccion","ubicacion","ubicados","encuentran","llego","llegar","local","sucursal"]) && b.dir) return "Estamos en "+b.dir+".";
    if(has(w,["telefono","numero","whatsapp","contacto","llamar","celular"]) && b.tel) return "Puedes contactarnos al "+b.tel+".";
    var ps=products(), hit=ps.filter(function(p){ return p.w.some(function(x){return x.length>3 && w.indexOf(x)>=0}) });
    if(hit.length) return hit.map(function(p){return p.name+(p.price?" cuesta "+p.price:": sí lo tenemos")}).join(". ")+".";
    if(has(w,["menu","productos","precio","precios","carta","ofrecen"]) && ps.length) return menuText();
    if(b.extra && w.length){ var sent=b.extra.split(/(?<=\.)\s+/).find(function(s){return overlap(w,words(s))>=0.5}); if(sent) return sent.trim() }
    return null;
  }
  function ago(t){ var m=Math.round((Date.now()-t)/60000); return m<1?"ahora":m<60?"hace "+m+" min":m<1440?"hace "+Math.round(m/60)+" h":"hace "+Math.round(m/1440)+" d" }
  function lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)) }catch(e){ return null } }
  function lsSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)) }catch(e){} }

  /* config y preguntas frecuentes: públicas para leer, las escribe solo el equipo */
  function watchBusiness(cb, onStatus){
    subscribe("/config", function(d){ if(d&&d.nombre){ config=d; demo=false } else if(!demo) config=d||{}; cb() }, onStatus, false);
    subscribe("/faqs", function(d){ if(!demo) faqsObj=d||{}; cb() }, null, false);
  }

  return {
    ready:ready, subscribe:subscribe, watchBusiness:watchBusiness,
    get:function(p,a){ return req("GET",p,undefined,a) }, put:function(p,b,a){ return req("PUT",p,b,a) },
    post:function(p,b,a){ return req("POST",p,b,a) }, patch:function(p,b,a){ return req("PATCH",p,b,a) },
    del:function(p,a){ return req("DELETE",p,undefined,a) },
    signIn:signIn, signOut:signOut, authed:authed, email:function(){ return S&&S.email },
    biz:biz, faqs:faqs, products:products, categories:categories, money:money, pesos:pesos, openNow:openNow, waLink:waLink, mapLink:mapLink,
    theme:theme, THEMES:THEMES, askAI:askAI, useDemo:useDemo, isDemo:function(){return demo}, DEMO:DEMO, menuText:menuText, answer:answer,
    lc1:lc1, ago:ago, lsGet:lsGet, lsSet:lsSet
  };
})();

function nexaToast(m){ var t=document.getElementById("toast"); if(!t) return; t.textContent=m; t.hidden=false; clearTimeout(nexaToast._t); nexaToast._t=setTimeout(function(){t.hidden=true},2800) }
