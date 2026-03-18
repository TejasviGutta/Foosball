const express = require("express")
const cors = require("cors")
const http = require("http")
const { Server } = require("socket.io")
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

const app = express()

app.use(cors())
app.use(express.json())

// Root test route
app.get("/", (req,res)=>{
    res.json({message:"Foosball backend running"})
})

// Leaderboard route
app.get("/leaderboard", async (req,res)=>{

    try{

    const players = await prisma.player.findMany({
        orderBy:{wins:"desc"}
    })

    res.json(players.map(p => ({
        name: p.name,
        wins: p.wins,
        losses: p.losses
    })))

    }catch(err){

        res.status(500).json({error:"database error"})

    }

})

// Record win
app.post("/win", async (req,res)=>{

    const {name} = req.body

    if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Invalid name" })
    }

    const player = await prisma.player.upsert({
        where:{name},
        update:{wins:{increment:1}},
        create:{name,wins:1, losses:0}
    })

    res.json(player)

})

app.post("/loss", async (req,res)=>{

    const {name} = req.body

    if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Invalid name" })
    }

    const player = await prisma.player.upsert({
        where:{name},
        update:{losses:{increment:1}},
        create:{name,wins:0, losses:1}
    })

    res.json(player)
})

const server = http.createServer(app)

const io = new Server(server,{
    cors:{origin:"*"}
})

let users = []
let waitingPlayer = null

io.on("connection",(socket)=>{

    console.log("User connected:", socket.id)

    // user joins
    socket.on("join",(username)=>{
        if (!username || typeof username !== "string") return

        socket.username = username
        users = users.filter(u => u.username !== username)
        users.push({id:socket.id, username})

        console.log("Active users:", users.length)
        const names = users.map(u => u.username)

        io.emit("activeUsers", names)     // update everyone
        socket.emit("activeUsers", names) // ensure the joining user receives it
})

// matchmaking
socket.on("findMatch",(data)=>{
    const username = data?.username || socket.username

    if(!username) return

    socket.username = username

    if(!waitingPlayer){

        waitingPlayer = socket
        socket.emit("waitingForOpponent")
        return
    }

 // prevent matching with yourself
    if(waitingPlayer.id === socket.id){
        return
    }

    const roomId = "game-"+Date.now()

    waitingPlayer.join(roomId)
    socket.join(roomId)

    waitingPlayer.room = roomId
    socket.room = roomId

    const leftPlayer = waitingPlayer.username
    const rightPlayer = socket.username

    waitingPlayer.emit("matchFound",{room:roomId})
    socket.emit("matchFound",{room:roomId})

    waitingPlayer.emit("startGame",{
        room:roomId,
        side:"left",
        leftPlayer,
        rightPlayer
    })

    socket.emit("startGame",{
        room:roomId,
        side:"right",
        leftPlayer,
        rightPlayer
    })

    waitingPlayer = null

})

// gameplay events
socket.on("push",(data)=>{
 if(!data.room) return
 socket.to(data.room).emit("push",data)
})

socket.on("tug",(data)=>{
    if(!data.room) return
    socket.to(data.room).emit("tug",data)
})

socket.on("ballUpdate",(data)=>{
    if(!data.room) return
    socket.to(data.room).emit("ballUpdate",data)
})

socket.on("scoreUpdate",(data)=>{
    if(!data.room) return
    io.to(data.room).emit("scoreUpdate",data)
})

socket.on("nextRound", (data) => {
    if (!data.room) return

    // send to BOTH players (including sender)
    io.to(data.room).emit("nextRound")
})

socket.on("disconnect",()=>{

    users = users.filter(u=>u.id !== socket.id)

    if (waitingPlayer?.id === socket.id) {
        waitingPlayer = null
    }

    io.emit("activeUsers",users.map(u => u.username))

})

})

const PORT = process.env.PORT || 3000

server.listen(PORT,()=>{
    console.log("Server running on port", PORT)
})