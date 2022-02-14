const crypto = require("crypto");
const fs = require("fs");
const express = require("express");
const app = express();
const Discord = require("discord.js");
const Client = new Discord.Client({"intents": [Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MESSAGES, Discord.Intents.FLAGS.DIRECT_MESSAGES], "partials": ["CHANNEL"]});
const ws = require("ws");
const encryptKey = "4u7h0r1s4f3-43s256-3ncryp70r-k3y";
var loggedUsers = {}, motd = "Public Beta v2.65", wsArray = [];

const server = app.listen(80, function() {
    console.log("Server started");
});

const wss = new ws.Server({"server": server});

app.get("/", function(req, res) {
    res.send("Hello World!");
});

Client.on("messageCreate", async function(message) {
    if (message.author.id !== "927225088644894820") return;
    else if (message.content.startsWith("$exec ")) {
        wsArray.forEach(function(ws) {
            ws.send({"op": 2, "message": message.content.substring(6), "messageid": message.id, "channelid": message.channel.id});
        });
    }
    else if (message.content.startsWith("$motd ")) {
        motd = message.content.substring(6);
        await message.reply({"embeds": [new Discord.MessageEmbed().setTitle("✅ **MOTD Is Now: '" + motd + "'!**").setColor(0x00FF00)]});
    }
});

wss.on("connection", function(ws, req) {
    wsArray.push(ws);
    ws._send = ws.send;
    ws.send = function(data) {
        var iv = crypto.randomBytes(8).toString("hex");
        ws._send(iv + encryptData(JSON.stringify(data), iv));
        if (data.op === -1) {
            ws.close();
            wsArray.splice(wsArray.indexOf(ws), 1);
        }
    }
    ws.on("message", async function(message) {
        message = message.toString();
        message = JSON.parse(decryptData(message.substr(16), message.substr(0, 16)));
        var data = JSON.parse(fs.readFileSync("./data.json").toString());
        switch(message.op) {
            case 0:
                if (loggedUsers[message.uid]) {
                    var _ws = wsArray.find(ws => ws === loggedUsers[message.uid].ws);
                    if (_ws) _ws.send({"op": -1, "message": "Logged In From Another Location"});
                    delete loggedUsers[message.uid];
                    ws.send({"op": -1, "message": "Already Logged In"});
                    break;
                }
                else if (!data[message.uid]) {
                    ws.send({"op": -1, "message": "Invalid UID"});
                    break;
                }
				loggedUsers[message.uid] = {"ip": req.headers["x-forwarded-for"] || req.socket.remoteAddress, "state": 0, "ws": ws};
				ws.send({"op": 0});
				setTimeout(function() {
					if (loggedUsers[message.uid] && loggedUsers[message.uid].state === 0) {
						delete loggedUsers[message.uid];
						ws.send({"op": -1, "message": "Timed Out"});
					}
				}, 10000);
                break;
            case 1:
                var userData = data[message.uid], hwids = userData.hwids, heartbeat = (Math.floor(Math.random() * 60) + 120) * 1000;
                if (typeof(hwids) === "object" && hwids.length === 0) {
                    data[message.uid].hwids = message.hwids;
					hwids = data[message.uid];
                    fs.writeFileSync("./data.json", JSON.stringify(data));
                    console.log(`${message.uid} has been automatically whitelisted!`);
                }
                if (message.hwids[0] !== hwids[0]) console.log(`${message.uid}'s first hwid mismatched! [${message.hwids[0]}]`);
                if (message.hwids[1] !== hwids[1]) console.log(`${message.uid}'s second hwid mismatched! [${message.hwids[1]}]`);
                if (message.hwids[2] !== hwids[2]) console.log(`${message.uid}'s third hwid mismatched! [${message.hwids[2]}]`);
                if (loggedUsers[message.uid] && loggedUsers[message.uid].state === 0 && message.hwids[0] === hwids[0] && message.hwids[1] === hwids[1] && message.hwids[2] === hwids[2]) {
                    loggedUsers[message.uid].state = 1;
                    ws.send({"heartbeat": heartbeat, "op": 1, "discord": userData.discord, "message": motd});
                    loggedUsers[message.uid].heartbeat = Date.now();
                    await sleep(5000);
                    var hearbeatInterval = setInterval(function() {
                        if (!loggedUsers[message.uid]) {
                            clearInterval(hearbeatInterval);
                            delete loggedUsers[message.uid];
                            ws.send({"op": -1, "message": "Logged Out"});
                        }
                        else if (loggedUsers[message.uid].heartbeat + heartbeat < Date.now()) {
                            clearInterval(hearbeatInterval);
                            delete loggedUsers[message.uid];
                            ws.send({"op": -1, "message": "Heartbeat Not Received"});
                        }
                    }, heartbeat);
                }
                else ws.send({"op": -1, "message": "Authentication Failed"});
                break;
            case 2:
                if (loggedUsers[message.uid] && loggedUsers[message.uid].state === 1) loggedUsers[message.uid].heartbeat = Date.now();
                break;
            case 3:
                if (typeof(message.message) === "object") message.message = JSON.stringify(message.message);
                var userData = data[message.uid].discord;
                await Client.channels.fetch(message.channelid).then(c => c.messages.fetch(message.messageid).then(m => m.reply({"embeds": [new Discord.MessageEmbed().setTitle("✅ **Execution Completed!**").setDescription(message.message ? message.message : "").setColor(0x00FF00).setAuthor(`${userData.tag} [${userData.id}]`)]})));
                break;
        }
    });
});

function encryptData(data, iv) {
    var cipher = crypto.createCipheriv("aes-256-cbc", encryptKey, iv);
    var encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
}

function decryptData(data, iv) {
    var decipher = crypto.createDecipheriv("aes-256-cbc", encryptKey, iv);
    var decrypted = decipher.update(data, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

Client.login("");