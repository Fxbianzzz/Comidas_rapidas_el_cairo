/* ==========================================================
   PedidoCentral · Lógica de la aplicación
   Los pedidos se guardan en el navegador (localStorage).
   Para compartirlos entre dispositivos, el siguiente paso es
   conectar una base de datos (Supabase o Firebase).
   ========================================================== */

var KEY="pedidocentral:v1",ESTADOS=["Recibido","En preparación","Listo","En camino","Entregado"],CANALES=["WhatsApp","App de domicilio","Instagram","Facebook","Llamada"];
var COL={"WhatsApp":"#1f9d55","App de domicilio":"#e8590c","Instagram":"#b5179e","Facebook":"#1c6ed6","Llamada":"#5c5a52"};
var db=load(),view="enc",dup=null,draft=null;
function load(){try{var d=JSON.parse(localStorage.getItem(KEY));if(d&&d.p)return d}catch(e){}return{n:0,p:[]}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function mins(t){return Math.floor((Date.now()-t)/60000)}
function activo(o){return o.e!=="Entregado"&&o.e!=="Cancelado"}
function prog(o){
  if(o.e==="Cancelado")return '';
  var i=ESTADOS.indexOf(o.e),done=o.e==="Entregado";
  return '<div class="prog'+(done?' done':'')+'">'+[0,1,2,3].map(function(k){return '<i class="'+(done||k<=i?'f':'')+'"></i>'}).join("")+'</div>'
}
function card(o,btns){
  var late=o.e==="Recibido"&&mins(o.t)>=10;
  return '<article class="ticket'+(late?' late':'')+'" style="--ch:'+(COL[o.canal]||"#5c5a52")+'"><div class="tb">'+
  '<div class="th"><span class="num">#'+o.n+'</span><span class="chip">'+esc(o.canal)+'</span></div>'+
  '<div class="who">'+esc(o.nombre)+'</div>'+
  '<div class="items">'+esc(o.items)+'</div>'+
  '<div class="meta">Dirección: '+esc(o.dir)+'<br>Teléfono: '+esc(o.tel)+(o.notas?'<br>Nota: '+esc(o.notas):'')+'</div>'+prog(o)+'</div>'+
  '<div class="tf"><span class="'+(late?'when l':'when')+'">'+(late?'¡Sin atender! ':'')+'Hace '+mins(o.t)+' min</span>'+(btns?'<span class="row" style="margin:0">'+btns+'</span>':'<span class="state">'+esc(o.e)+'</span>')+'</div></article>'
}
function adv(o,label){return '<button class="btn sm" onclick="next('+o.n+')">'+label+'</button>'}
function find(n){return db.p.filter(function(x){return x.n===n})[0]}
function next(n){var o=find(n);if(!o)return;var i=ESTADOS.indexOf(o.e);if(i<ESTADOS.length-1)o.e=ESTADOS[i+1];save();render()}
function cancel(n){var o=find(n);if(o){o.e="Cancelado";save();render()}}
function setView(v){view=v;render()}
function guardar(force){
  var g=function(id){return document.getElementById(id).value.trim()};
  var d={canal:g("canal"),nombre:g("nombre"),tel:g("tel"),dir:g("dir"),items:g("items"),notas:g("notas")};
  draft=d;
  if(!d.nombre||!d.tel||!d.dir||!d.items){dup="falta";render();return}
  var digits=d.tel.replace(/\D/g,"");
  var rep=db.p.filter(function(o){return activo(o)&&o.tel.replace(/\D/g,"")===digits&&mins(o.t)<=20})[0];
  if(rep&&!force){dup=rep;render();return}
  db.n+=1;db.p.unshift({n:db.n,t:Date.now(),e:"Recibido",canal:d.canal,nombre:d.nombre,tel:d.tel,dir:d.dir,items:d.items,notas:d.notas});
  save();dup=null;draft=null;render()
}
function ejemplos(){
  var now=Date.now(),m=60000,add=function(mn,e,c,n,t,d,i,no){db.n+=1;db.p.unshift({n:db.n,t:now-mn*m,e:e,canal:c,nombre:n,tel:t,dir:d,items:i,notas:no||""})};
  add(14,"Recibido","WhatsApp","Laura Pérez","3001112233","Cra 5 #10-20","2 hamburguesas dobles\n1 gaseosa","Sin cebolla");
  add(8,"En preparación","App de domicilio","Carlos Díaz","3014445566","Calle 8 #3-15","1 perro caliente\nPapas grandes");
  add(3,"Listo","Instagram","Ana Ruiz","3027778899","Mz B Casa 4","3 alitas x6","Salsa BBQ aparte");
  save();render()
}
function reset(){db={n:0,p:[]};save();dup=null;draft=null;render()}
function vEnc(){
  var d=draft||{canal:CANALES[0],nombre:"",tel:"",dir:"",items:"",notas:""};
  var opts=CANALES.map(function(c){return '<option'+(c===d.canal?' selected':'')+'>'+c+'</option>'}).join("");
  var alerta="";
  if(dup==="falta")alerta='<div class="warn">Completa nombre, teléfono, dirección y productos para guardar el pedido.</div>';
  else if(dup)alerta='<div class="warn"><b>Posible pedido duplicado.</b> Este teléfono ya tiene el pedido #'+dup.n+' activo desde hace '+mins(dup.t)+' min, recibido por '+esc(dup.canal)+'.<div class="row"><button class="btn sm" onclick="guardar(true)">Es otro pedido, guardar</button><button class="btn sm sec" onclick="dup=null;render()">Revisar</button></div></div>';
  var lista=db.p.length?db.p.map(function(o){return card(o,activo(o)?'<button class="btn sm sec" onclick="cancel('+o.n+')">Cancelar</button>':'')}).join(""):'<p class="empty">Aún no hay pedidos. Registra el primero o carga unos ejemplos para probar.</p>';
  return '<div class="grid"><section class="panel"><h2>Nuevo pedido</h2>'+
  '<label for="canal">Canal por el que llegó</label><select id="canal">'+opts+'</select>'+
  '<label for="nombre">Nombre del cliente</label><input id="nombre" value="'+esc(d.nombre)+'">'+
  '<label for="tel">Teléfono</label><input id="tel" inputmode="tel" value="'+esc(d.tel)+'">'+
  '<label for="dir">Dirección</label><input id="dir" value="'+esc(d.dir)+'">'+
  '<label for="items">Productos y adiciones (uno por línea)</label><textarea id="items">'+esc(d.items)+'</textarea>'+
  '<label for="notas">Notas (opcional)</label><input id="notas" value="'+esc(d.notas)+'">'+alerta+
  '<div class="row"><button class="btn big" onclick="guardar(false)">Guardar pedido</button></div></section>'+
  '<section class="panel"><h2>Pedidos de hoy ('+db.p.length+')</h2>'+lista+
  '<div class="small"><button class="btn sm sec" onclick="ejemplos()">Cargar ejemplos</button><button class="btn sm sec" onclick="reset()">Borrar todo</button></div></section></div>'
}
function col(t,arr,fn,vacio){return '<section class="panel"><h2>'+t+' ('+arr.length+')</h2>'+(arr.length?arr.map(fn).join(""):'<p class="empty">'+vacio+'</p>')+'</section>'}
function ord(a){return a.slice().sort(function(x,y){return x.t-y.t})}
function por(e){return ord(db.p.filter(function(o){return o.e===e}))}
function vCocina(){
  return '<div class="cols">'+col("Por preparar",por("Recibido"),function(o){return card(o,adv(o,"Empezar a preparar"))},"No hay pedidos en cola. Cuando el encargado registre uno, aparece aquí.")+col("En preparación",por("En preparación"),function(o){return card(o,adv(o,"Marcar listo"))},"Ningún pedido en preparación.")+'</div>'
}
function vDom(){
  return '<div class="cols">'+col("Listos para recoger",por("Listo"),function(o){return card(o,adv(o,"Salir a entregar"))},"Aún no hay pedidos listos.")+col("En camino",por("En camino"),function(o){return card(o,adv(o,"Marcar entregado"))},"No tienes entregas en curso.")+'</div>'
}
function render(){
  var tabs=[["enc","Encargado"],["coc","Cocina"],["dom","Domiciliario"]];
  document.getElementById("stats").innerHTML=[["Por preparar",por("Recibido").length],["En cocina",por("En preparación").length],["En reparto",por("Listo").length+por("En camino").length]].map(function(s){return '<div class="stat"><b>'+s[1]+'</b><span>'+s[0]+'</span></div>'}).join("");
  document.getElementById("nav").innerHTML=tabs.map(function(t){return '<button class="'+(view===t[0]?'on':'')+'" onclick="setView(\''+t[0]+'\')">'+t[1]+'</button>'}).join("");
  document.getElementById("main").innerHTML=view==="enc"?vEnc():view==="coc"?vCocina():vDom()
}
window.addEventListener("storage",function(e){if(e.key===KEY){db=load();render()}});
setInterval(function(){var a=document.activeElement;if(!a||a.tagName==="BODY"||a.tagName==="BUTTON")render()},30000);
render();
