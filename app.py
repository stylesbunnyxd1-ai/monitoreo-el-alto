"""Monitoreo de la contaminación ambiental de El Alto - servidor Flask.
Python maneja autenticación, CRUD, permisos y consultas; el navegador
muestra el mapa y escucha Supabase Realtime."""
import os
import json
import time
import base64
import uuid
import collections
import re
import unicodedata
import urllib.parse
import urllib.request
from datetime import timedelta
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session
from supabase import create_client

load_dotenv()
URL, KEY = os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"]
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET"]  # obligatorio: sin esta variable la app no arranca
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=True)
app.permanent_session_lifetime = timedelta(days=30)








def sb():
    """Cliente Supabase. Con sesión iniciada, cada consulta viaja con el JWT
    del usuario, así las políticas RLS de la base de datos se aplican."""
    c = create_client(URL, KEY)
    if session.get("token"):
        c.postgrest.auth(session["token"])
    return c


def solo_admin(f):
    """Páginas exclusivas del administrador."""
    @wraps(f)
    def w(*a, **k):
        if not session.get("uid"):
            return redirect("/acceso")
        if session.get("rol") != "admin":
            return redirect("/")
        return f(*a, **k)
    return w


def login_required(f):
    @wraps(f)
    def w(*a, **k):
        if not session.get("uid"):
            return jsonify(error="Inicia sesión para continuar"), 401
        return f(*a, **k)
    return w


def config_front():
    """Datos que el navegador necesita: Supabase (solo clave pública) y quién inició sesión."""
    return {"url": URL, "key": KEY, "user": session.get("nombre"), "rol": session.get("rol")}


# ---------- Renovación automática de la sesión ----------
def _expira(token):
    """Lee cuándo vence el token de Supabase (viene dentro del propio token)."""
    try:
        p = token.split(".")[1]
        p += "=" * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p))["exp"]
    except Exception:
        return 0


@app.before_request
def renovar_token():
    """Antes de cada petición: si el token vence en menos de 1 minuto, se renueva."""
    if session.get("token") and _expira(session["token"]) - time.time() < 60:
        try:
            r = create_client(URL, KEY).auth.refresh_session(session["refresh"])
            session["token"], session["refresh"] = r.session.access_token, r.session.refresh_token
        except Exception:
            session.clear()  # no se pudo renovar: se pedirá iniciar sesión otra vez


# ---------- Páginas y autenticación ----------
@app.get("/")
def index():
    return render_template("inicio.html", cfg=config_front(), activo="inicio")

@app.get("/nuevo-reporte")
def nuevo_reporte():
    if not session.get("uid"):
        return redirect("/acceso")
    return redirect("/?nuevo=1")

@app.get("/reporte/<int:rid>")
def pagina_reporte(rid):
    return render_template("detalle.html", cfg=config_front(), rid=rid,
                           activo="mis" if session.get("uid") else "reportes")

@app.get("/mapa")
def mapa_redirect():
    return redirect("/tiempo-real")


@app.get("/reportes")
def lista_reportes():
    return render_template("lista.html", cfg=config_front(), activo="reportes", mios=False,
                           titulo="Lista de reportes",
                           subtitulo="Busca y filtra los reportes ambientales de El Alto.")


@app.get("/tiempo-real")
def tiempo_real():
    return render_template("tiempo_real.html", cfg=config_front(), activo="mapa")


@app.get("/notificaciones")
def pagina_notificaciones():
    if not session.get("uid"):
        return redirect("/acceso")
    return render_template("notificaciones.html", cfg=config_front(), activo="notificaciones")

@app.get("/perfil")
def perfil():
    if not session.get("uid"):
        return redirect("/acceso")
    return render_template("perfil.html", cfg=config_front(), activo="perfil")




@app.get("/mis-reportes")
def mis_reportes():
    if not session.get("uid"):
        return redirect("/acceso")
    return render_template("lista.html", cfg=config_front(), activo="mis", mios=True,
                           titulo="Mis reportes",
                           subtitulo="Los reportes que registraste y cómo van avanzando.")

@app.get("/admin/pendientes")
@solo_admin
def admin_pendientes():
    return render_template("admin.html", cfg=config_front(), activo="pendientes", modo="pendientes",
                           titulo="Reportes pendientes de revisión")


@app.get("/admin/verificados")
@solo_admin
def admin_verificados():
    return render_template("admin.html", cfg=config_front(), activo="verificados", modo="verificados",
                           titulo="Reportes verificados")


@app.get("/admin/usuarios")
@solo_admin
def admin_usuarios():
    return render_template("usuarios.html", cfg=config_front(), activo="usuarios")




@app.route("/acceso", methods=["GET", "POST"])
def acceso():
    msg, ok, modo = None, None, request.args.get("modo", "login")
    if request.method == "POST":
        f = request.form
        modo = f["modo"]
        try:
            if modo == "registro":
                if len(f["password"]) < 8:
                    raise ValueError("La contraseña debe tener mínimo 8 caracteres")
                if f["password"] != f.get("confirmar"):
                    raise ValueError("Las contraseñas no coinciden")
                r = sb().auth.sign_up({"email": f["email"], "password": f["password"],
                                       "options": {"data": {"nombre": f["nombre"].strip()}}})
                if not r.session:
                    return render_template("login.html", cfg=config_front(),
                                           ok="Cuenta creada. Confirma tu correo e inicia sesión.")
            else:
                r = sb().auth.sign_in_with_password({"email": f["email"], "password": f["password"]})
            session.permanent = bool(f.get("recordar"))  # Recordarme: la sesión dura 30 días
            session["token"], session["refresh"], session["uid"] = (
                r.session.access_token, r.session.refresh_token, r.user.id)
            p = sb().table("profiles").select("nombre,rol").eq("id", r.user.id).single().execute().data
            session["nombre"], session["rol"] = p["nombre"], p["rol"]
            return redirect("/")
        except ValueError as e:
            msg = str(e)
        except Exception as e:
            msg = "Correo o contraseña incorrectos" if "credentials" in str(e).lower() else f"No se pudo continuar: {e}"
    plantilla = "registro.html" if modo == "registro" else "login.html"
    return render_template(plantilla, msg=msg, ok=ok, modo=modo, cfg=config_front())


@app.get("/salir")
def salir():
    session.clear()
    return redirect("/")


@app.get("/recuperar")
def recuperar():
    return render_template("recuperar.html", cfg=config_front())


# ---------- API ----------
@app.get("/api/catalogos")
def catalogos():
    c = sb()
    tablas = (("tipos", "tipos_contaminacion"), ("zonas", "zonas"), ("estados", "estados"))
    return jsonify({k: c.table(t).select("*").order("nombre" if t == "zonas" else "id").execute().data for k, t in tablas})




@app.get("/api/reportes")
def listar():
    q = (sb().table("reportes_ambientales")
         .select("id,descripcion,gravedad,latitud,longitud,created_at,tipo_id,zona_id,estado_id,"
                 "tipos_contaminacion(nombre),zonas(nombre),estados(nombre),confirmaciones(count),"
                 "evidencias(archivo_url),seguimientos(estado_id,observacion,created_at)")
         .order("created_at", desc=True))
    for campo in ("tipo_id", "zona_id", "estado_id", "gravedad"):
        if request.args.get(campo):
            q = q.eq(campo, request.args[campo])
    if request.args.get("desde"):
        q = q.gte("created_at", request.args["desde"])
    if request.args.get("mios") and session.get("uid"):
        q = q.eq("usuario_id", session["uid"])
    return jsonify(q.execute().data)

def _norm(t):
    """Texto sin tildes, sin mayúsculas y sin espacios repetidos, para comparar zonas."""
    t = unicodedata.normalize("NFD", t or "")
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", t).strip().lower()


def zona_id_por_nombre(nombre):
    """Busca la zona ignorando mayúsculas y tildes; si no existe, la crea (con la clave de servicio)."""
    nombre = re.sub(r"\s+", " ", nombre or "").strip()
    if not re.fullmatch(r"[\w .,'°º/-]{3,60}", nombre):
        raise ValueError("Escribe una zona válida (de 3 a 60 letras o números)")
    srv = create_client(URL, SERVICE_KEY)
    for z in srv.table("zonas").select("id,nombre").execute().data:
        if _norm(z["nombre"]) == _norm(nombre):
            return z["id"]
    return srv.table("zonas").insert({"nombre": nombre[0].upper() + nombre[1:]}).execute().data[0]["id"]


_cache_zona = {}


@app.get("/api/zona-sugerida")
@login_required
def zona_sugerida():
    """Pregunta a OpenStreetMap en qué barrio cae el punto marcado. Es solo una sugerencia."""
    try:
        lat, lng = round(float(request.args["lat"]), 4), round(float(request.args["lng"]), 4)
    except (KeyError, ValueError):
        return jsonify(zona=None)
    if (lat, lng) in _cache_zona:
        return jsonify(zona=_cache_zona[(lat, lng)])
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
        {"lat": lat, "lon": lng, "format": "jsonv2", "zoom": 16, "addressdetails": 1, "accept-language": "es"})
    try:
        pedido = urllib.request.Request(url, headers={"User-Agent": "ElAltoLimpio/1.0 (proyecto academico)"})
        with urllib.request.urlopen(pedido, timeout=4) as resp:
            dir_ = json.load(resp).get("address", {})
    except Exception:
        return jsonify(zona=None)
    zona = next((dir_[k] for k in ("neighbourhood", "suburb", "quarter", "city_district", "hamlet") if dir_.get(k)), None)
    if len(_cache_zona) > 500:
        _cache_zona.clear()
    _cache_zona[(lat, lng)] = zona
    return jsonify(zona=zona)

@app.post("/api/reportes")
@login_required
def crear():
    d = request.json
    try:
        zona_id = int(d["zona_id"]) if d.get("zona_id") else zona_id_por_nombre(d.get("zona"))
        r = sb().table("reportes_ambientales").insert({
            "usuario_id": session["uid"], "tipo_id": int(d["tipo_id"]), "zona_id": zona_id,
            "gravedad": d["gravedad"], "descripcion": d["descripcion"].strip(),
            "latitud": round(float(d["latitud"]), 6), "longitud": round(float(d["longitud"]), 6),
        }).execute()
        return jsonify(r.data[0]), 201
    except Exception as e:
        return jsonify(error=f"No se guardó: {e}"), 400


@app.post("/api/reportes/<int:rid>/confirmar")
@login_required
def confirmar(rid):
    try:
        sb().table("confirmaciones").insert({"reporte_id": rid, "usuario_id": session["uid"]}).execute()
        return jsonify(ok=True)
    except Exception as e:
        m = str(e)
        if "23505" in m or "duplicate" in m:
            m = "Ya confirmaste este reporte"
        elif "propio" in m:
            m = "No puedes confirmar tu propio reporte"
        return jsonify(error=m), 400


@app.post("/api/reportes/<int:rid>/estado")
@login_required
def cambiar_estado(rid):
    """El administrador verifica, rechaza o cambia el seguimiento de un reporte."""
    if session.get("rol") != "admin":
        return jsonify(error="Solo el administrador cambia estados"), 403
    estado = int(request.json["estado_id"])
    obs = (request.json.get("observacion") or "").strip()
    if estado == 3 and len(obs) < 5:
        return jsonify(error="Escribe el motivo del rechazo (mínimo 5 letras)"), 400
    c = sb()
    r = c.table("reportes_ambientales").update({"estado_id": estado}).eq("id", rid).execute()
    if not r.data:
        return jsonify(error="Sin permiso o reporte inexistente"), 403
    if obs:  # el trigger ya creó la fila de historial; le agregamos el motivo
        s = (c.table("seguimientos").select("id").eq("reporte_id", rid)
             .order("id", desc=True).limit(1).execute().data)
        if s:
            c.table("seguimientos").update({"observacion": obs}).eq("id", s[0]["id"]).execute()
    return jsonify(ok=True)


@app.post("/api/reportes/<int:rid>/evidencia")
@login_required
def subir_evidencia(rid):
    """Sube una foto o video a Supabase Storage y lo registra en la tabla evidencias."""
    archivo = request.files.get("archivo") or request.files.get("foto")
    tipos = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4"}
    if not archivo or archivo.mimetype not in tipos:
        return jsonify(error="Sube un archivo JPG, PNG o MP4"), 400
    datos = archivo.read()
    if len(datos) > 10 * 1024 * 1024:
        return jsonify(error="El archivo supera los 10 MB"), 400
    # Solo el autor del reporte puede agregar evidencias
    dueno = sb().table("reportes_ambientales").select("usuario_id").eq("id", rid).execute().data
    if not dueno or dueno[0]["usuario_id"] != session["uid"]:
        return jsonify(error="Solo el autor del reporte puede agregar evidencias"), 403
    ruta = f"{rid}/{uuid.uuid4().hex}.{tipos[archivo.mimetype]}"
    try:
        srv = create_client(URL, SERVICE_KEY)
        srv.storage.from_("evidencias").upload(ruta, datos, {"content-type": archivo.mimetype})
        url = srv.storage.from_("evidencias").get_public_url(ruta)
        srv.table("evidencias").insert({"reporte_id": rid, "archivo_url": url}).execute()
        return jsonify(ok=True, url=url), 201
    except Exception as e:
        return jsonify(error=f"No se subió el archivo: {e}"), 400


@app.get("/api/reportes/<int:rid>")
def detalle_reporte(rid):
    """Un reporte completo. No se envía quién lo creó (privacidad)."""
    c = sb()
    r = (c.table("reportes_ambientales")
         .select("id,descripcion,gravedad,latitud,longitud,created_at,usuario_id,tipo_id,zona_id,estado_id,"
                 "tipos_contaminacion(nombre),zonas(nombre),estados(nombre),confirmaciones(count),"
                 "evidencias(archivo_url),seguimientos(estado_id,observacion,created_at)")
         .eq("id", rid).execute().data)
    if not r:
        return jsonify(error="Reporte no encontrado"), 404
    r, uid = r[0], session.get("uid")
    r["es_autor"] = bool(uid) and r.pop("usuario_id") == uid
    r.pop("usuario_id", None)
    r["ya_confirmo"] = bool(uid) and bool(
        c.table("confirmaciones").select("id").eq("reporte_id", rid).eq("usuario_id", uid).execute().data)
    if session.get("rol") == "admin":
        r["denuncias"] = (c.table("reportes_error").select("tipo,detalle,created_at")
                          .eq("reporte_id", rid).order("created_at", desc=True).execute().data)
    return jsonify(r)


@app.post("/api/reportes/<int:rid>/error")
@login_required
def reportar_error(rid):
    """Un vecino avisa que un reporte es falso, duplicado o está mal ubicado."""
    d = request.json or {}
    if d.get("tipo") not in ("falso", "duplicado", "ubicacion", "otro"):
        return jsonify(error="Elige qué problema tiene el reporte"), 400
    try:
        sb().table("reportes_error").insert({
            "reporte_id": rid, "usuario_id": session["uid"],
            "tipo": d["tipo"], "detalle": (d.get("detalle") or "").strip()[:300]}).execute()
        return jsonify(ok=True), 201
    except Exception as e:
        m = str(e)
        if "23505" in m or "duplicate" in m:
            m = "Ya enviaste un aviso sobre este reporte"
        return jsonify(error=m), 400


@app.get("/api/usuarios")
@login_required
def api_usuarios():
    if session.get("rol") != "admin":
        return jsonify(error="Solo el administrador"), 403
    c = sb()
    perfiles = c.table("profiles").select("id,nombre,rol,created_at").order("created_at", desc=True).execute().data
    cuenta = collections.Counter(
        r["usuario_id"] for r in c.table("reportes_ambientales").select("usuario_id").execute().data)
    for p in perfiles:
        p["reportes"] = cuenta.get(p["id"], 0)
        p["es_yo"] = p["id"] == session["uid"]
    return jsonify(perfiles)


@app.post("/api/usuarios/<uid>/rol")
@login_required
def cambiar_rol(uid):
    """Solo un administrador puede dar o quitar permisos. Usa la clave de servicio, que nunca sale del servidor."""
    if session.get("rol") != "admin":
        return jsonify(error="Solo el administrador"), 403
    rol = (request.json or {}).get("rol")
    if rol not in ("usuario", "admin"):
        return jsonify(error="Rol no válido"), 400
    if uid == session["uid"]:
        return jsonify(error="No puedes cambiar tu propio rol"), 400
    try:
        create_client(URL, SERVICE_KEY).table("profiles").update({"rol": rol}).eq("id", uid).execute()
        return jsonify(ok=True)
    except Exception as e:
        return jsonify(error=f"No se pudo cambiar el rol: {e}"), 400

# ---------- Comentarios de la comunidad ----------
_com_recientes = collections.defaultdict(list)


def _puede_comentar(uid):
    """Máximo 5 comentarios por minuto y por persona (evita spam)."""
    ahora = time.time()
    lista = [t for t in _com_recientes[uid] if ahora - t < 60]
    ok = len(lista) < 5
    if ok:
        lista.append(ahora)
    _com_recientes[uid] = lista
    return ok


def _primer_nombre(perfil):
    partes = ((perfil or {}).get("nombre") or "").split()
    return partes[0] if partes else "Vecino"


@app.get("/api/reportes/<int:rid>/comentarios")
def listar_comentarios(rid):
    """Comentarios de un reporte. Solo se muestra el primer nombre de cada autor (privacidad).
    La base de datos (RLS) esconde los comentarios ocultos a quien no es su autor ni administrador."""
    filas = (sb().table("comentarios").select("id,usuario_id,padre_id,texto,oculto,created_at")
             .eq("reporte_id", rid).order("created_at").execute().data)
    perfiles = {}
    ids = list({f["usuario_id"] for f in filas})
    if ids:  # la tabla profiles es privada, por eso los nombres se leen con la clave de servicio
        for p in (create_client(URL, SERVICE_KEY).table("profiles")
                  .select("id,nombre,rol").in_("id", ids).execute().data):
            perfiles[p["id"]] = p
    uid = session.get("uid")
    return jsonify([{
        "id": f["id"], "padre_id": f["padre_id"], "texto": f["texto"], "oculto": f["oculto"],
        "created_at": f["created_at"], "mio": f["usuario_id"] == uid,
        "autor": _primer_nombre(perfiles.get(f["usuario_id"])),
        "es_admin": (perfiles.get(f["usuario_id"]) or {}).get("rol") == "admin",
    } for f in filas])


@app.post("/api/reportes/<int:rid>/comentarios")
@login_required
def comentar(rid):
    d = request.json or {}
    texto = re.sub(r"[ \t]+", " ", str(d.get("texto") or "")).strip()
    if not 2 <= len(texto) <= 500:
        return jsonify(error="El comentario debe tener entre 2 y 500 caracteres"), 400
    c = sb()
    if not c.table("reportes_ambientales").select("id").eq("id", rid).execute().data:
        return jsonify(error="Reporte no encontrado"), 404
    padre = None
    if d.get("padre_id"):
        try:
            padre = int(d["padre_id"])
        except (TypeError, ValueError):
            return jsonify(error="Respuesta no válida"), 400
        p = c.table("comentarios").select("reporte_id,padre_id").eq("id", padre).execute().data
        if not p or p[0]["reporte_id"] != rid or p[0]["padre_id"]:  # solo se responde a comentarios principales
            return jsonify(error="No se puede responder a ese comentario"), 400
    if not _puede_comentar(session["uid"]):
        return jsonify(error="Estás comentando muy rápido. Espera un momento."), 429
    try:
        r = c.table("comentarios").insert({"reporte_id": rid, "usuario_id": session["uid"],
                                           "padre_id": padre, "texto": texto}).execute()
        return jsonify(r.data[0]), 201
    except Exception:
        app.logger.exception("No se pudo guardar el comentario")
        return jsonify(error="No se pudo publicar el comentario"), 400


@app.post("/api/comentarios/<int:cid>/ocultar")
@login_required
def ocultar_comentario(cid):
    """Moderación: el administrador oculta o vuelve a mostrar un comentario."""
    if session.get("rol") != "admin":
        return jsonify(error="Solo el administrador puede moderar"), 403
    oculto = bool((request.json or {}).get("oculto", True))
    r = sb().table("comentarios").update({"oculto": oculto}).eq("id", cid).execute()
    return jsonify(ok=True) if r.data else (jsonify(error="Comentario no encontrado"), 404)


@app.delete("/api/comentarios/<int:cid>")
@login_required
def borrar_comentario(cid):
    """Lo puede borrar su autor o el administrador (la base de datos lo exige con RLS)."""
    r = sb().table("comentarios").delete().eq("id", cid).execute()
    return jsonify(ok=True) if r.data else (jsonify(error="No puedes borrar este comentario"), 403)


@app.get("/estadisticas")
def pagina_estadisticas():
    return render_template("estadisticas.html", cfg=config_front(), activo="estadisticas")


@app.get("/api/estadisticas")
def api_estadisticas():
    """Consultas de recurrencia: totales, tipos frecuentes y zonas con más concentración.
    Los reportes rechazados no cuentan."""
    rows = (sb().table("reportes_ambientales")
            .select("estado_id,gravedad,latitud,longitud,tipos_contaminacion(nombre),zonas(nombre)")
            .neq("estado_id", 3).execute().data)
    peso = {"baja": 1, "media": 2, "alta": 3}
    por_estado = collections.Counter(r["estado_id"] for r in rows)
    por_tipo = collections.Counter(r["tipos_contaminacion"]["nombre"] for r in rows).most_common()

    zonas = {}
    for r in rows:
        z = zonas.setdefault(r["zonas"]["nombre"], {"n": 0, "lat": 0.0, "lng": 0.0, "g": 0})
        z["n"] += 1
        z["lat"] += float(r["latitud"])
        z["lng"] += float(r["longitud"])
        z["g"] += peso[r["gravedad"]]
    lista_zonas = []
    for nombre, z in zonas.items():
        media = z["g"] / z["n"]  # gravedad promedio de la zona
        lista_zonas.append({"nombre": nombre, "n": z["n"], "lat": z["lat"] / z["n"], "lng": z["lng"] / z["n"],
                            "nivel": "alta" if media >= 2.5 else "media" if media >= 1.7 else "baja"})
    lista_zonas.sort(key=lambda z: z["n"], reverse=True)

    return jsonify(total=len(rows), estados=dict(por_estado),
                   tipos=[{"nombre": n, "n": c} for n, c in por_tipo], zonas=lista_zonas)



@app.get("/api/perfil")
@login_required
def api_perfil():
    """Datos y estadísticas personales de quien tiene la sesión iniciada."""
    c, uid = sb(), session["uid"]
    p = c.table("profiles").select("nombre,rol,created_at").eq("id", uid).single().execute().data
    try:
        correo = c.auth.get_user(session["token"]).user.email
    except Exception:
        correo = ""
    mios = c.table("reportes_ambientales").select("estado_id").eq("usuario_id", uid).execute().data
    confs = c.table("confirmaciones").select("id").eq("usuario_id", uid).execute().data
    return jsonify(nombre=p["nombre"], rol=p["rol"], correo=correo, registro=p["created_at"],
                   creados=len(mios), confirmaciones=len(confs),
                   # en seguimiento = ya verificados por el administrador y aún sin solucionar
                   seguimiento=sum(1 for r in mios if r["estado_id"] in (2, 4, 5)))


@app.post("/api/perfil")
@login_required
def actualizar_perfil():
    """Solo se puede cambiar el nombre. El rol nunca se toca desde aquí."""
    nombre = ((request.json or {}).get("nombre") or "").strip()
    if not 2 <= len(nombre) <= 60:
        return jsonify(error="El nombre debe tener entre 2 y 60 letras"), 400
    try:
        create_client(URL, SERVICE_KEY).table("profiles").update({"nombre": nombre}).eq("id", session["uid"]).execute()
        session["nombre"] = nombre
        return jsonify(ok=True, nombre=nombre)
    except Exception as e:
        return jsonify(error=f"No se pudo guardar: {e}"), 400


@app.get("/api/notificaciones")
@login_required
def api_notificaciones():
    """Avisos armados con lo que ya existe: reportes nuevos, cambios de estado y confirmaciones."""
    c = sb()
    items = []

    for r in (c.table("reportes_ambientales").select("id,created_at,zonas(nombre)")
              .neq("estado_id", 3).order("created_at", desc=True).limit(15).execute().data):
        items.append({"tipo": "nuevo", "titulo": "Nuevo reporte registrado",
                      "texto": f"Se ha creado un nuevo reporte en {r['zonas']['nombre']}.",
                      "fecha": r["created_at"], "reporte": r["id"]})

    cambios = {2: ("confirmado", "Reporte confirmado", "ha sido confirmado por el administrador."),
               4: ("estado", "Cambio de estado", "ahora es prioritario."),
               5: ("estado", "Cambio de estado", "ahora está en atención."),
               6: ("estado", "Cambio de estado", "fue solucionado.")}
    for s in (c.table("seguimientos").select("reporte_id,estado_id,created_at")
              .in_("estado_id", list(cambios)).order("created_at", desc=True).limit(15).execute().data):
        tipo, titulo, frase = cambios[s["estado_id"]]
        items.append({"tipo": tipo, "titulo": titulo, "texto": f"El reporte #{s['reporte_id']} {frase}",
                      "fecha": s["created_at"], "reporte": s["reporte_id"]})

    try:
        confs = (c.table("confirmaciones").select("reporte_id,created_at")
                 .order("created_at", desc=True).limit(15).execute().data)
    except Exception:
        confs = []
    for x in confs:
        items.append({"tipo": "comunitaria", "titulo": "Confirmación comunitaria",
                      "texto": f"El reporte #{x['reporte_id']} ha recibido una nueva confirmación.",
                      "fecha": x["created_at"], "reporte": x["reporte_id"]})

                          try:
        coms = (c.table("comentarios").select("reporte_id,created_at")
                .order("created_at", desc=True).limit(15).execute().data)
    except Exception:
        coms = []
    for x in coms:
        items.append({"tipo": "comentario", "titulo": "Nuevo comentario",
                      "texto": f"Un usuario ha comentado en el reporte #{x['reporte_id']}.",
                      "fecha": x["created_at"], "reporte": x["reporte_id"]})

    items.sort(key=lambda i: i["fecha"] or "", reverse=True)
    return jsonify(items[:30])




if __name__ == "__main__":
        app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
