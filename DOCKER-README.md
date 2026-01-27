# 🐳 Gestión de Facturas - Docker

Sistema completo de gestión de facturas con autenticación, listo para producción.

## 🚀 Inicio Rápido

### Opción 1: Docker Compose (Recomendado)

```bash
# 1. Clonar o descargar el proyecto
git clone <tu-repositorio>
cd FACTURAS\ NOFRE\ PLOMER

# 2. Construir y ejecutar
docker-compose up -d

# 3. Acceder a la aplicación
open http://localhost:3000
```

### Opción 2: Docker Manual

```bash
# Construir la imagen
docker build -t facturas-app .

# Ejecutar el contenedor
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e SESSION_SECRET=tu-secret-key-seguro \
  -e INIT_DEMO_DATA=true \
  --name facturas \
  facturas-app
```

## 📋 Credenciales Iniciales

```
Usuario: admin
Contraseña: admin123
```

> ⚠️ **IMPORTANTE**: Cambia la contraseña inmediatamente después del primer acceso.

## 🎯 Datos Demo Incluidos

Al iniciar por primera vez con `INIT_DEMO_DATA=true`, se crean:

- ✅ **Empresa demo**: Nofre Plomer S.L. (fontanería)
- ✅ **8 Artículos/Servicios**: Reparaciones, instalaciones, materiales
- ✅ **Factura de ejemplo**: Con 3 líneas de productos/servicios
- ✅ **Usuario admin**: Con permisos completos

## ⚙️ Configuración

### Variables de Entorno

Crea un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
```

Variables disponibles:

| Variable | Descripción | Por Defecto |
|----------|-------------|-------------|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `PORT` | Puerto de la aplicación | `3000` |
| `SESSION_SECRET` | Clave secreta para sesiones | ⚠️ **CAMBIAR** |
| `INIT_DEMO_DATA` | Inicializar datos demo | `true` |
| `DB_PATH` | Ruta de la base de datos | `./data/invoices.db` |

### Producción

Para producción, **DEBES**:

1. **Cambiar `SESSION_SECRET`**:
   ```bash
   # Generar una clave segura
   openssl rand -base64 32
   ```

2. **Configurar HTTPS** (recomendado con reverse proxy como Nginx)

3. **Desactivar datos demo**:
   ```bash
   INIT_DEMO_DATA=false
   ```

4. **Configurar backups** de la carpeta `data/`

## 📂 Estructura de Volúmenes

```
./data/
└── invoices.db    # Base de datos SQLite
```

Los datos persisten en el directorio `./data` del host.

## 🔄 Comandos Útiles

```bash
# Ver logs
docker-compose logs -f

# Reiniciar
docker-compose restart

# Detener
docker-compose down

# Detener y eliminar datos
docker-compose down -v

# Reconstruir imagen
docker-compose up -d --build
```

## 🛡️ Seguridad

- ✅ Contraseñas hasheadas con bcrypt
- ✅ Sesiones seguras con express-session
- ✅ Cookies HTTP-only
- ✅ Protección CSRF con SameSite
- ✅ Prevención de inyección SQL
- ✅ Control de acceso por roles

## 📊 Roles de Usuario

| Rol | Permisos |
|-----|----------|
| **Admin** | Acceso completo + gestión de usuarios |
| **User** | Crear/editar facturas, artículos, empresas |
| **Viewer** | Solo visualizar facturas |

## 🔧 Mantenimiento

### Backup de Base de Datos

```bash
# Copiar base de datos
docker cp facturas-nofre-plomer:/app/data/invoices.db ./backup-$(date +%Y%m%d).db
```

### Restaurar Backup

```bash
# Detener contenedor
docker-compose down

# Restaurar base de datos
cp backup-20240127.db ./data/invoices.db

# Reiniciar
docker-compose up -d
```

### Limpiar y Empezar de Cero

```bash
# Detener y eliminar todo
docker-compose down -v

# Eliminar base de datos
rm -rf ./data

# Reiniciar con datos demo
docker-compose up -d
```

## 🌐 Reverse Proxy (Nginx)

Ejemplo de configuración Nginx:

```nginx
server {
    listen 80;
    server_name facturas.tudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📝 Funcionalidades

- ✨ Gestión de empresas emisoras
- ✨ Catálogo de artículos y servicios
- ✨ Creación de facturas con líneas
- ✨ Generación de PDF
- ✨ Filtros avanzados
- ✨ Sistema de usuarios con roles
- ✨ Autenticación segura
- ✨ Preparado para Veri*Factu

## 🐛 Troubleshooting

### El contenedor no inicia

```bash
# Ver logs detallados
docker-compose logs

# Verificar permisos de la carpeta data
chmod -R 755 ./data
```

### No puedo acceder a la aplicación

```bash
# Verificar que el puerto 3000 está libre
lsof -i :3000

# Verificar que el contenedor está corriendo
docker ps
```

### Olvidé la contraseña de admin

```bash
# Acceder al contenedor
docker exec -it facturas-nofre-plomer sh

# Ejecutar script de reset (crear este script si es necesario)
node reset-admin-password.js
```

## 📞 Soporte

Para problemas o preguntas, consulta la documentación o crea un issue.

---

**Versión**: 1.0.0  
**Licencia**: MIT  
**Autor**: Nofre Plomer S.L.
