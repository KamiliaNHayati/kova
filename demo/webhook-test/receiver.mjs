// receiver.mjs
import http from "http";

http.createServer((req, res) => {
    if (req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            console.log("\n📨 Webhook received!");
            try {
                console.log(JSON.stringify(JSON.parse(body), null, 2));
            } catch {
                console.log(body);
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
        });
    } else {
        res.writeHead(200);
        res.end("Webhook receiver running");
    }
}).listen(5000, () => console.log("🌐 Webhook receiver at http://localhost:5000"));