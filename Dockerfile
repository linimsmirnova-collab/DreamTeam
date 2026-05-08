# Используем официальный образ Node.js версии 20 (LTS)
FROM node:25-alpine

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app/backend

# Копируем файлы package.json и package-lock.json (если есть)
# Это нужно, чтобы зависимости установились до копирования исходников (слой кэшируется)
COPY backend/package*.json ./

# Устанавливаем зависимости
RUN npm install --production

# Копируем всё содержимое папки backend
COPY backend/ .

# Копируем папку WEB на уровень выше, как в твоей структуре
COPY WEB/ ../WEB/

# Сообщаем Docker, что приложение будет слушать порт 3000
EXPOSE 3000

# Команда запуска сервера (рабочая директория уже backend)
CMD ["node", "server.js"]