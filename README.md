# 🧾 Sistema de Gestión de Facturas - Nofre Plomer

Sistema completo de gestión de facturas con integración Veri*Factu.

## 🚀 Instalación Rápida con Docker

### Requisitos
- Docker Desktop instalado

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/bielet20/factverifact.git
cd factverifact

# 2. Iniciar la aplicación
docker-compose up -d

# 3. Acceder
# Abre tu navegador en: http://localhost:3000
```

### Credenciales por Defecto
- **Usuario:** `admin`
- **Contraseña:** `admin123`

⚠️ **Cambia la contraseña después del primer login**

---

## 📖 Documentación Completa

Ver [Guía de Instalación Docker](./DOCKER-INSTALL.md) para instrucciones detalladas.

---

## ✨ Características

- ✅ Gestión de empresas y clientes
- ✅ Creación y edición de facturas
- ✅ Gestión de artículos/productos
- ✅ Integración Veri*Factu
- ✅ Generación de PDFs
- ✅ Sistema de usuarios y permisos
- ✅ Backups automáticos
- ✅ Recuperación de contraseña por email

---

## 🛠️ Comandos Útiles

```bash
# Iniciar
docker-compose up -d

# Detener
docker-compose down

# Ver logs
docker-compose logs -f

# Actualizar
git pull && docker-compose up -d --build
```

---

## 🌐 Acceso desde Red Local

1. Encuentra tu IP: `ipconfig` (Windows) o `ifconfig` (Mac/Linux)
2. Accede desde otro equipo: `http://TU-IP:3000`

---

## 💾 Backup

```bash
# Backup manual
cp invoices.db invoices.db.backup

# Restaurar
cp invoices.db.backup invoices.db
docker-compose restart
```

---

## 📞 Soporte

- Ver logs: `docker-compose logs`
- Issues: https://github.com/bielet20/factverifact/issues

---

## 📄 Licencia

Propietario - GABRIEL RIVERO SAMPOL
