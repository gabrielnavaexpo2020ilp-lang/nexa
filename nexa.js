/* NEXA — núcleo compartido por la página del cliente (index.html) y el panel del equipo (equipo.html).
   Base de datos: Firebase Realtime Database por REST (sin SDK).
   Acceso del equipo: Firebase Authentication con correo y contraseña. */
var NEXA_DB = "https://nexa-c5176-default-rtdb.firebaseio.com";
var NEXA_API_KEY = "PEGA_AQUI_TU_CLAVE_DE_API_WEB";
var NEXA_AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
var NEXA_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";

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
  function biz(){ var b=config||{}; return {nombre:b.nombre||"",giro:b.giro||"",horario:b.horario||"",tel:b.tel||"",dir:b.dir||"",prod:b.prod||"",extra:b.extra||""} }
  function faqs(){ var o=faqsObj||{}; return Object.keys(o).map(function(id){ return Object.assign({id:id}, o[id]) }).sort(function(a,b){return (a.at||0)-(b.at||0)}) }

  /* ---------- texto ---------- */
  var STOP="que tienen tiene hay para los las una uno unos unas con por del como cual donde esta estan son sus ustedes puedo pueden tengo mas algun alguna venden manejan aceptan quiero saber hola buenas buenos dias tardes noches favor me nos le les el la lo al de en y o a es su mi tu se si no".split(" ");
  function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9ñ ]/g," ")}
  function stem(w){return w.length>4 ? w.replace(/(es|s)$/,"") : w}
  function words(s){return norm(s).split(/\s+/).filter(function(w){return w.length>2 && STOP.indexOf(w)<0}).map(stem)}
  function overlap(a,b){ if(!a.length||!b.length) return 0; var c=0; a.forEach(function(w){ if(b.indexOf(w)>=0) c++ }); return c/Math.min(a.length,b.length) }
  function has(ws,list){ return list.some(function(x){return ws.indexOf(stem(norm(x)))>=0}) }
  function lc1(s){ return String(s).replace(/^(\w)/,function(c){return c.toLowerCase()}) }
  function products(){
    return biz().prod.split("\n").map(function(l){
      var m=l.split(/\s+-\s+|:\s*/); var name=(m[0]||"").trim(); var price=(m.slice(1).join(" ")||"").trim();
      return name?{name:name,price:price,w:words(name)}:null }).filter(Boolean);
  }
  function menuText(){ var ps=products(); return ps.length?"Este es nuestro menú:\n"+ps.map(function(p){return "• "+p.name+(p.price?" — "+p.price:"")}).join("\n"):"" }
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
    subscribe("/config", function(d){ config=d||{}; cb() }, onStatus, false);
    subscribe("/faqs", function(d){ faqsObj=d||{}; cb() }, null, false);
  }

  return {
    ready:ready, subscribe:subscribe, watchBusiness:watchBusiness,
    get:function(p,a){ return req("GET",p,undefined,a) }, put:function(p,b,a){ return req("PUT",p,b,a) },
    post:function(p,b,a){ return req("POST",p,b,a) }, patch:function(p,b,a){ return req("PATCH",p,b,a) },
    del:function(p,a){ return req("DELETE",p,undefined,a) },
    signIn:signIn, signOut:signOut, authed:authed, email:function(){ return S&&S.email },
    biz:biz, faqs:faqs, products:products, menuText:menuText, answer:answer,
    lc1:lc1, ago:ago, lsGet:lsGet, lsSet:lsSet
  };
})();

function nexaToast(m){ var t=document.getElementById("toast"); if(!t) return; t.textContent=m; t.hidden=false; clearTimeout(nexaToast._t); nexaToast._t=setTimeout(function(){t.hidden=true},2800) }
