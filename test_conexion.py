import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

estados = sb.table("estados").select("nombre").execute().data
print("Conexión OK. Estados encontrados:")
for e in estados:
    print(" -", e["nombre"])