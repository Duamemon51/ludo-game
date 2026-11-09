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

By default, the client connects to port 3001 on the same host used to open the
page. Leave `VITE_SERVER_URL` unset for local and same-Wi-Fi phone testing.

To test on a phone, connect it to the same Wi-Fi as the development computer,
start both the server and client, then open `http://<computer-LAN-IP>:5173` on
the phone (for example, `http://192.168.1.5:5173`). Allow inbound connections
to ports 5173 and 3001 through the computer's firewall if prompted. The phone
will connect to the game server on the same LAN IP and port 3001.

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
