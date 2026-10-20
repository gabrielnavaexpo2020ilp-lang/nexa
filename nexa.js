/* NEXA — núcleo compartido por la página del cliente (index.html) y el panel del equipo (equipo.html).
   Base de datos: Firebase Realtime Database por REST + streaming (sin SDK). */
var NEXA_DB = "https://nexa-c5176-default-rtdb.firebaseio.com";
var NEXA_PIN = "2026";                         // clave para entrar al panel del equipo

var Nexa = (function(){
  "use strict";
  var base = String(NEXA_DB).replace(/\/+$/,"");
  var ready = /^https:\/\/.+firebase(io\.com|database\.app)$/.test(base);
  var tree = {}, listeners = [], es = null, online = false;

  function emit(){ listeners.forEach(function(f){ try{ f(tree) }catch(e){ console.error(e) } }) }
  function setAt(path, data, merge){
    var parts = path.split("/").filter(Boolean);
    if(!parts.length){
      if(merge && data){ Object.keys(data).forEach(function(k){ setAt("/"+k, data[k]) }) }
      else tree = data || {};
      return;
    }
    var node = tree;
    for(var i=0;i<parts.length-1;i++){
      if(typeof node[parts[i]]!=="object" || node[parts[i]]===null) node[parts[i]]={};
      node = node[parts[i]];
    }
    var last = parts[parts.length-1];
    if(merge && data && typeof data==="object"){
      if(typeof node[last]!=="object"||node[last]===null) node[last]={};
      Object.keys(data).forEach(function(k){ setAt("/"+parts.join("/")+"/"+k, data[k]) });
    } else if(data===null) delete node[last];
    else node[last]=data;
  }
  function connect(onStatus){
    if(!ready){ onStatus && onStatus("setup"); return }
    try{ es && es.close() }catch(e){}
    es = new EventSource(base + "/.json");
    es.addEventListener("put", function(e){ var m=JSON.parse(e.data); setAt(m.path, m.data, false); online=true; onStatus&&onStatus("on"); emit() });
    es.addEventListener("patch", function(e){ var m=JSON.parse(e.data); setAt(m.path, m.data, true); emit() });
    es.addEventListener("cancel", function(){ online=false; onStatus&&onStatus("denied") });
    es.addEventListener("auth_revoked", function(){ online=false; onStatus&&onStatus("denied") });
    es.onerror = function(){ online=false; onStatus&&onStatus("off") };
  }
  function req(method, path, body){
    if(!ready) return Promise.reject(new Error("setup"));
    return fetch(base + path + ".json", {method:method, headers:{"Content-Type":"application/json"}, body: body===undefined?undefined:JSON.stringify(body)})
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json() });
  }

  /* ---------- texto ---------- */
  var STOP="que tienen tiene hay para los las una uno unos unas con por del como cual donde esta estan son sus ustedes puedo pueden tengo mas algun alguna venden manejan aceptan quiero saber hola buenas buenos dias tardes noches favor me nos le les el la lo al de en y o a es su mi tu se si no".split(" ");
  function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9ñ ]/g," ")}
  function stem(w){return w.length>4 ? w.replace(/(es|s)$/,"") : w}
  function words(s){return norm(s).split(/\s+/).filter(function(w){return w.length>2 && STOP.indexOf(w)<0}).map(stem)}
  function overlap(a,b){ if(!a.length||!b.length) return 0; var c=0; a.forEach(function(w){ if(b.indexOf(w)>=0) c++ }); return c/Math.min(a.length,b.length) }
  function has(ws,list){ return list.some(function(x){return ws.indexOf(stem(norm(x)))>=0}) }
  function lc1(s){ return String(s).replace(/^(\w)/,function(c){return c.toLowerCase()}) }

  function biz(){ var b=tree.config||{}; return {nombre:b.nombre||"",giro:b.giro||"",horario:b.horario||"",tel:b.tel||"",dir:b.dir||"",prod:b.prod||"",extra:b.extra||""} }
  function list(key){ var o=tree[key]||{}; return Object.keys(o).map(function(id){ return Object.assign({id:id}, o[id]) }) }
  function faqs(){ return list("faqs").sort(function(a,b){return (a.at||0)-(b.at||0)}) }
  function preguntas(){ return list("preguntas").sort(function(a,b){return (a.at||0)-(b.at||0)}) }
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

  return {
    ready:ready, connect:connect, onChange:function(f){ listeners.push(f) },
    get:function(p){ return req("GET",p) }, put:function(p,b){ return req("PUT",p,b) },
    post:function(p,b){ return req("POST",p,b) }, patch:function(p,b){ return req("PATCH",p,b) },
    del:function(p){ return req("DELETE",p) },
    biz:biz, faqs:faqs, preguntas:preguntas, products:products, menuText:menuText, answer:answer,
    lc1:lc1, ago:ago, lsGet:lsGet, lsSet:lsSet, isOnline:function(){return online}
  };
})();

function nexaToast(m){ var t=document.getElementById("toast"); if(!t) return; t.textContent=m; t.hidden=false; clearTimeout(nexaToast._t); nexaToast._t=setTimeout(function(){t.hidden=true},2800) }
