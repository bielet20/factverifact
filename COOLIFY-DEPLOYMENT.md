# 🚀 Despliegue en Coolify

Sistema completo de gestión de facturas - Guía de despliegue para Coolify.

---

## 📋 Requisitos Previos

- Cuenta en Coolify
- Repositorio Git (GitHub, GitLab, Bitbucket)
- Servidor con Coolify instalado

---

## 🔧 Paso 1: Preparar Repositorio Git

### Subir código a Git

```bash
cd "/Users/bielrivero/APPS ANTIGRAVITY BIEL/FACTURAS NOFRE PLOMER"

git init
git add .
git commit -m "Initial commit - Invoice management system"
git remote add origin https://github.com/tu-usuario/facturas-nofre-plomer.git
git push -u origin main
```

### Archivos necesarios (ya incluidos)

- ✅ `Dockerfile`
- ✅ `docker-compose.yml`
- ✅ `.dockerignore`
- ✅ `package.json`
- ✅ `.env.example`

---

## 🌐 Paso 2: Crear Aplicación en Coolify

1. **Acceder a Coolify** → Projects → + New Resource → Application
2. **Configurar repositorio**:
   - Source: GitHub/GitLab
   - Repository: `facturas-nofre-plomer`
   - Branch: `main`
   - Build Pack: **Dockerfile**
3. **Configuración básica**:
   ```
   Name: facturas-nofre-plomer
   Port: 3000
   ```

---

## ⚙️ Paso 3: Variables de Entorno

En **Environment Variables**, añadir:

```bash
NODE_ENV=production
PORT=3000
SESSION_SECRET=<openssl rand -base64 32>
INIT_DEMO_DATA=true
```

### Generar SESSION_SECRET seguro:

```bash
openssl rand -base64 32
```

---

## 💾 Paso 4: Volumen Persistente

**CRÍTICO** para persistencia de base de datos:

1. Ve a **Storage** → + Add Volume
2. Configura:
   ```
   Name: facturas-data
   Source: /var/lib/coolify/applications/<app-id>/data
   Destination: /app/data
   ```

---

## 🔒 Paso 5: Dominio y SSL

1. **Domains** → + Add Domain
2. Ingresa: `facturas.tudominio.com`
3. **Enable SSL** (Let's Encrypt automático)

---

## 🚀 Paso 6: Desplegar

1. Click **Deploy**
2. Monitorear en **Logs**:
   ```
   ✅ Build successful
   ✅ Server running on port 3000
   ✅ Datos de demostración inicializados
   ```

---

## ✅ Paso 7: Verificar

### Acceder:
- `https://facturas.tudominio.com`

### Login:
```
Usuario: admin
Contraseña: admin123
```

### Verificar datos demo:
- ✅ Empresa: Nofre Plomer S.L.
- ✅ 8 Artículos/Servicios
- ✅ Factura de ejemplo

---

## 🔄 Actualizaciones

### Auto-deploy:
1. **Settings** → Enable **Auto Deploy**
2. Cada push a `main` despliega automáticamente

### Manual:
```bash
git push
# Luego en Coolify: Click "Deploy"
```

---

## 🔐 Post-Despliegue

### Checklist de seguridad:
- [ ] Cambiar contraseña de admin
- [ ] Verificar `SESSION_SECRET` único
- [ ] Configurar `INIT_DEMO_DATA=false` tras setup inicial
- [ ] Configurar backups

---

## 💾 Backups

### Manual (SSH al servidor):

```bash
docker cp <container-id>:/app/data/invoices.db ./backup-$(date +%Y%m%d).db
```

### Automático (cron):

```bash
0 3 * * * docker cp <container-id>:/app/data/invoices.db /backups/facturas-$(date +\%Y\%m\%d).db
```

---

## 🐛 Troubleshooting

### App no inicia:
1. Revisar **Logs** en Coolify
2. Verificar variables de entorno
3. Comprobar volumen montado

### Acceder al contenedor:
```bash
# En Coolify Terminal
sh
ls -la /app/data/
```

---

## 📝 Comandos Útiles

### Ver base de datos:
```bash
sqlite3 /app/data/invoices.db
.tables
SELECT * FROM users;
```

### Reiniciar:
- Coolify: Click **Restart**
- O: `docker restart <container-id>`

---

## 🎯 Resumen

**URLs después del despliegue:**
- App: `https://facturas.tudominio.com`
- Coolify: `https://coolify.tudominio.com`

**Credenciales:**
- Usuario: `admin`
- Contraseña: `admin123` (cambiar inmediatamente)

---

**¡Listo!** Aplicación desplegada y funcionando en Coolify.

Para más detalles, ver [DOCKER-README.md](./DOCKER-README.md)
