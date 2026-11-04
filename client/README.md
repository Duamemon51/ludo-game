# Ludo

## Local development

Run the game server and client in separate terminals:

```powershell
cd server
npm install
npm start
```

```powershell
cd client
npm install
Copy-Item .env.example .env
npm run dev
```

The local `.env` should point `VITE_SERVER_URL` to `http://localhost:3001`.

## Deployment

Deploy the `server` directory to a Node.js host that supports persistent
Socket.IO connections and WebSockets (for example, Render). Set its start
command to `npm start`; the server listens on the host-provided `PORT`.

Deploy the `client` directory to Vercel. In the Vercel project's environment
variables, set `VITE_SERVER_URL` to the public base URL of the deployed game
server, such as `https://your-ludo-server.onrender.com` (no `/socket.io` path).
Then redeploy the client, since Vite embeds this value at build time.

Do not set `VITE_SERVER_URL` to the Vercel frontend URL. Vercel serves the
client, while the separate game server owns the Socket.IO sessions; routing
Socket.IO polling requests to the frontend can produce HTTP 400 responses.
