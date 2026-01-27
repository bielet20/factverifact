# Gestión de Facturas - Nofre Plomer

Sistema completo de gestión de facturas con autenticación y control de usuarios.

## 🚀 Características

- ✨ Gestión de empresas emisoras
- ✨ Catálogo de artículos y servicios
- ✨ Creación de facturas con líneas
- ✨ Generación de PDF
- ✨ Filtros avanzados
- ✨ Sistema de usuarios con roles (Admin/User/Viewer)
- ✨ Autenticación segura
- ✨ Preparado para Veri*Factu

## 📦 Despliegue

### Docker Compose (Local)

```bash
# Inicio rápido
./start.sh

# O manualmente
docker-compose up -d
```

### Coolify (Producción)

Ver guía completa en [COOLIFY-DEPLOYMENT.md](./COOLIFY-DEPLOYMENT.md)

**Resumen rápido:**
1. Sube el código a Git
2. Crea nueva aplicación en Coolify
3. Configura variables de entorno
4. Añade volumen persistente en `/app/data`
5. Despliega

## 🔑 Credenciales Iniciales

```
Usuario: admin
Contraseña: admin123
```

> ⚠️ Cambiar inmediatamente en producción

## 📋 Variables de Entorno

```bash
NODE_ENV=production
PORT=3000
SESSION_SECRET=<genera-aleatorio-seguro>
INIT_DEMO_DATA=true  # false en producción
```

## 🗂️ Estructura

```
├── Dockerfile              # Imagen Docker
├── docker-compose.yml      # Orquestación
├── server.js              # Servidor Express
├── database.js            # SQLite
├── auth.js                # Autenticación
├── init-demo.js           # Datos demo
├── public/                # Frontend
└── data/                  # Base de datos (volumen)
```

## 📚 Documentación

- [DOCKER-README.md](./DOCKER-README.md) - Guía Docker completa
- [COOLIFY-DEPLOYMENT.md](./COOLIFY-DEPLOYMENT.md) - Despliegue en Coolify

## 🛡️ Seguridad

- Contraseñas hasheadas con bcrypt
- Sesiones seguras con express-session
- Cookies HTTP-only y SameSite
- Control de acceso por roles
- Prevención de inyección SQL

## 📊 Datos Demo

Incluye empresa de fontanería con:
- Nofre Plomer S.L.
- 8 artículos/servicios
- Factura de ejemplo

## 🔧 Desarrollo

```bash
npm install
npm start
```

## 📝 Licencia

MIT
