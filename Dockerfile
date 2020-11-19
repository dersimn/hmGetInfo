FROM node:slim

COPY index.js /app/index.js
COPY package.json /app/package.json

WORKDIR /app

RUN npm install
RUN mkdir output

ENTRYPOINT [ "node", "index.js" ]
