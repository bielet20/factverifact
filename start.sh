#!/bin/bash

echo "🚀 Iniciando Gestión de Facturas - FACTAPP"
echo "=============================================="

# Verificar si Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "❌ Docker no está instalado. Por favor, instala Docker primero."
    exit 1
fi

# Verificar si docker-compose está instalado
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose no está instalado. Por favor, instala Docker Compose primero."
    exit 1
fi

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    echo "📝 Creando archivo .env desde .env.example..."
    cp .env.example .env
    
    # Generar SESSION_SECRET aleatorio
    if command -v openssl &> /dev/null; then
        SECRET=$(openssl rand -base64 32)
        sed -i.bak "s/change-this-to-a-random-secure-string-in-production/$SECRET/" .env
        rm .env.bak 2>/dev/null
        echo "✅ SESSION_SECRET generado automáticamente"
    else
        echo "⚠️  Por favor, cambia SESSION_SECRET en el archivo .env"
    fi
fi

# Crear directorio de datos si no existe
mkdir -p data

echo ""
echo "🐳 Construyendo imagen Docker..."
docker-compose build

echo ""
echo "🚀 Iniciando contenedor..."
docker-compose up -d

echo ""
echo "⏳ Esperando a que el servidor esté listo..."
sleep 5

# Verificar si el servidor está corriendo
if curl -s http://localhost:3000 > /dev/null; then
    echo ""
    echo "✅ ¡Aplicación iniciada correctamente!"
    echo ""
    echo "📋 Información de acceso:"
    echo "   URL: http://localhost:3000"
    echo "   Usuario: admin"
    echo "   Contraseña: admin123"
    echo ""
    echo "⚠️  IMPORTANTE: Cambia la contraseña en el primer acceso"
    echo ""
    echo "📊 Ver logs: docker-compose logs -f"
    echo "🛑 Detener: docker-compose down"
    echo ""
else
    echo ""
    echo "❌ Error al iniciar la aplicación"
    echo "📊 Ver logs con: docker-compose logs"
    exit 1
fi
